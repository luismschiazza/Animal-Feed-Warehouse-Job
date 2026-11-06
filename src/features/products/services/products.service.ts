import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { CreateProductDto } from '../dtos/validation/create-product.dto';
import { ListProductsDto } from '../dtos/validation/list-products.dto';
import { UpdateProductDto } from '../dtos/validation/update-product.dto';
import { Product, verifyProductIndexes } from '../schemas/product.schema';

const createFields = [
  'sku',
  'name',
  'description',
  'brand',
  'category',
  'targetSpecies',
  'saleUnit',
  'priceCents',
  'packageWeightGrams',
  'status',
];
const updateFields = createFields.filter((field) => !['sku', 'saleUnit'].includes(field));

@Injectable()
export class ProductsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    private readonly resources: ScopedResourcesService,
    private readonly audit: SecurityAuditService,
  ) {}

  // Service boundary as well as HTTP DTOs: no direct caller can mass-assign authority/operators.
  private data<T extends object>(type: new () => T, raw: unknown, allowed: string[]): T {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Object.keys(raw).some((key) => !allowed.includes(key))
    )
      throw new BadRequestException('Invalid product fields');
    const data = plainToInstance(type, raw, { enableImplicitConversion: false });
    if (
      validateSync(data, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })
        .length
    )
      throw new BadRequestException('Invalid product data');
    return data;
  }

  private scope(actor: PolicySubject, id?: string) {
    if (id !== undefined && !/^[a-f0-9]{24}$/i.test(id))
      throw new BadRequestException('Invalid product ID');
    return {
      ...(id ? { _id: new Types.ObjectId(id) } : {}),
      organizationId: new Types.ObjectId(actor.organizationId),
      ownerId: { $type: 'objectId' },
      createdBy: { $type: 'objectId' },
      accessState: { $in: ['active', 'locked'] },
      archivedAt: null,
    };
  }

  private async execute<T>(
    action: PolicyAction,
    subject: PolicySubject,
    id: string | undefined,
    work: (actor: PolicySubject) => Promise<T>,
  ) {
    let actor: PolicySubject;
    try {
      ({ actor } = await this.resources.authorize(PolicyResource.PRODUCT, action, subject, id));
      return await work(actor);
    } catch (error) {
      // Classify the public outcome before journaling: a duplicate SKU is a denied
      // business operation (409), not an internal storage error. Never journal raw Mongo data.
      const outcome =
        error instanceof HttpException
          ? error
          : error?.code === 11000
            ? new ConflictException('SKU already exists in this organization')
            : error?.name === 'ValidationError'
              ? new BadRequestException('Invalid product data')
              : new ServiceUnavailableException('Product operation unavailable');
      await this.audit.record(AuditEvent.PRODUCT, this.audit.result(outcome), 'service', actor, {
        resource: PolicyResource.PRODUCT,
        action,
        targetId: id,
      });
      throw outcome;
    }
  }

  private async write<T>(
    action: PolicyAction,
    subject: PolicySubject,
    id: string | undefined,
    work: (actor: PolicySubject, session: ClientSession) => Promise<T>,
  ) {
    return this.execute(action, subject, id, async () => {
      await verifyProductIndexes(this.products); // deliberate operator DDL only; never cache missing/dropped index
      const session = await this.connection.startSession();
      try {
        return await session.withTransaction(
          async () => {
            // Revalidate on every driver callback retry, not just at route/first attempt.
            const { actor } = await this.resources.authorize(
              PolicyResource.PRODUCT,
              action,
              subject,
              id,
            );
            const result = await work(actor, session);
            await this.audit.record(
              AuditEvent.PRODUCT,
              'allowed',
              'service',
              actor,
              {
                resource: PolicyResource.PRODUCT,
                action,
                targetId: id ?? (result as any)._id.toString(),
              },
              session,
            );
            return result;
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            readPreference: 'primary',
          },
        );
      } finally {
        await session.endSession();
      }
    });
  }

  create(raw: CreateProductDto, subject: PolicySubject) {
    const id = new Types.ObjectId(); // stable across transaction callback retries
    return this.write(PolicyAction.CREATE, subject, undefined, async (actor, session) => {
      const data = this.data(CreateProductDto, raw, createFields);
      const [product] = await this.products.create(
        [
          {
            ...data,
            sku: data.sku.toUpperCase(),
            _id: id,
            organizationId: new Types.ObjectId(actor.organizationId),
            ownerId: new Types.ObjectId(actor.id),
            createdBy: new Types.ObjectId(actor.id),
            accessState: 'active',
          },
        ],
        { session },
      );
      return product;
    });
  }

  list(raw: ListProductsDto, subject: PolicySubject) {
    return this.execute(PolicyAction.LIST, subject, undefined, async (actor) => {
      const query = this.data(ListProductsDto, raw, ['limit', 'before']);
      const rows = await this.products
        .find({
          ...this.scope(actor),
          ...(query.before ? { _id: { $lt: new Types.ObjectId(query.before) } } : {}),
        })
        .sort({ _id: -1 })
        .limit(query.limit + 1)
        .lean();
      const more = rows.length > query.limit,
        items = rows.slice(0, query.limit);
      return { items, nextCursor: more ? items[items.length - 1]._id.toString() : null };
    });
  }

  get(id: string, subject: PolicySubject) {
    return this.execute(PolicyAction.READ, subject, id, async (actor) => {
      const product = await this.products.findOne(this.scope(actor, id)).lean();
      if (!product) throw new NotFoundException('Product not found');
      return product;
    });
  }

  update(id: string, raw: UpdateProductDto, subject: PolicySubject) {
    return this.write(PolicyAction.UPDATE, subject, id, async (actor, session) => {
      const data = this.data(UpdateProductDto, raw, updateFields);
      if (!Object.keys(data).some((key) => data[key] !== undefined))
        throw new BadRequestException('Empty product update');
      const product = await this.products.findOneAndUpdate(
        { ...this.scope(actor, id), accessState: 'active' },
        { $set: data },
        { new: true, runValidators: true, session },
      );
      if (!product) throw new ForbiddenException('Product access denied');
      return product;
    });
  }

  archive(id: string, subject: PolicySubject) {
    return this.write(PolicyAction.DELETE, subject, id, async (actor, session) => {
      const product = await this.products.findOneAndUpdate(
        { ...this.scope(actor, id), accessState: 'active' },
        { $set: { archivedAt: new Date() } },
        { new: true, runValidators: true, session },
      );
      if (!product) throw new ForbiddenException('Product access denied');
      return product;
    });
  }
}
