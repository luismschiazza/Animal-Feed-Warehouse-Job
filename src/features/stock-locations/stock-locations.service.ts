import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Connection, Model, Types } from 'mongoose';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { CreateStockLocationDto, ListStockLocationsDto } from './stock-location.dto';
import {
  StockLocation,
  StockLocationStatus,
  verifyStockLocationIndexes,
} from './stock-location.schema';

const resource = PolicyResource.STOCK_LOCATION;
const view = ({ _id, code, name, status }: StockLocation) => ({
  id: _id.toString(),
  code,
  name,
  status,
});

function input<T extends object>(type: new () => T, raw: unknown, fields: string[]) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).some((key) => !fields.includes(key))
  )
    throw new BadRequestException('Invalid stock location fields');
  const dto = plainToInstance(type, raw, { enableImplicitConversion: false });
  if (
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })
      .length
  )
    throw new BadRequestException('Invalid stock location data');
  return dto;
}

@Injectable()
export class StockLocationsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(StockLocation.name) private readonly locations: Model<StockLocation>,
    private readonly resources: ScopedResourcesService,
    private readonly audit: SecurityAuditService,
  ) {}

  private async execute<T>(
    action: PolicyAction,
    subject: PolicySubject,
    work: (actor: PolicySubject) => Promise<T>,
  ) {
    let actor: PolicySubject;
    try {
      ({ actor } = await this.resources.authorize(resource, action, subject));
      return await work(actor);
    } catch (error) {
      const outcome =
        error instanceof HttpException
          ? error
          : error?.code === 11000
            ? new ConflictException('Stock location code already exists in this organization')
            : new ServiceUnavailableException('Stock location operation unavailable');
      await this.audit.record(
        AuditEvent.STOCK_LOCATION,
        this.audit.result(outcome),
        'service',
        actor,
        { resource, action },
      );
      throw outcome;
    }
  }

  create(raw: CreateStockLocationDto, subject: PolicySubject) {
    const action = PolicyAction.CREATE;
    return this.execute(action, subject, async () => {
      const { code, name } = input(CreateStockLocationDto, raw, ['code', 'name']);
      const id = new Types.ObjectId();
      await verifyStockLocationIndexes(this.locations);
      const session = await this.connection.startSession();
      try {
        return await session.withTransaction(
          async () => {
            const { actor } = await this.resources.authorize(resource, action, subject);
            const [row] = await this.locations.create(
              [
                {
                  _id: id,
                  organizationId: new Types.ObjectId(actor.organizationId),
                  code: code.toUpperCase(),
                  name,
                  status: StockLocationStatus.ACTIVE,
                },
              ],
              { session },
            );
            await this.audit.record(
              AuditEvent.STOCK_LOCATION,
              'allowed',
              'service',
              actor,
              { resource, action, targetId: id.toString() },
              session,
            );
            return view(row);
          },
          {
            readPreference: 'primary',
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority', j: true },
          },
        );
      } finally {
        await session.endSession();
      }
    });
  }

  list(raw: ListStockLocationsDto, subject: PolicySubject) {
    return this.execute(PolicyAction.LIST, subject, async (actor) => {
      const { before, limit } = input(ListStockLocationsDto, raw, ['before', 'limit']);
      const rows = await this.locations
        .find({
          organizationId: new Types.ObjectId(actor.organizationId),
          ...(before === undefined ? {} : { _id: { $lt: new Types.ObjectId(before) } }),
        })
        .collation({ locale: 'simple' })
        .read('primary')
        .sort({ _id: -1 })
        .limit(limit + 1)
        .select('_id code name status')
        .lean();
      const items = rows.slice(0, limit).map(view);
      return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
    });
  }
}
