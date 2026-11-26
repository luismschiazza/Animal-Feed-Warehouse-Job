import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, PipelineStage, Types } from 'mongoose';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import {
  MAX_LOCAL_BALANCE,
  ReceiveStockDto,
  StockBalanceQueryDto,
  canonicalReceipt,
  intentKey,
  validated,
} from './stock-receipt.dto';
import {
  BALANCE_MODEL,
  RECEIPT_MODEL,
  StockBalance,
  StockReceipt,
  StockUnit,
  verifyStockIndexes,
} from './stock-receipt.schema';

const receiptResource = PolicyResource.STOCK_RECEIPT;
const create = PolicyAction.CREATE;
const list = PolicyAction.LIST;
const oid = (id: string) => new Types.ObjectId(id);
const notFound = () => new NotFoundException('Stock resource not found');
const unavailable = () => new ServiceUnavailableException('Stock operation unavailable');
const unitFor = (saleUnit: unknown): StockUnit => {
  if (saleUnit === 'unit') return 'unit';
  if (saleUnit === 'kg') return 'g';
  throw notFound();
};
const view = ({
  _id,
  productId,
  locationId,
  quantity,
  unit,
  recordedAt,
  reference,
}: StockReceipt) => ({
  id: _id.toString(),
  productId: productId.toString(),
  locationId: locationId.toString(),
  quantity,
  unit,
  recordedAt,
  reference,
});

@Injectable()
export class StockReceiptsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(BALANCE_MODEL) private readonly balances: Model<StockBalance>,
    @InjectModel(RECEIPT_MODEL) private readonly receipts: Model<StockReceipt>,
    private readonly resources: ScopedResourcesService,
    private readonly audit: SecurityAuditService,
    private readonly config: ConfigService,
  ) {}

  private async execute<T>(
    resource: PolicyResource,
    action: PolicyAction,
    subject: PolicySubject,
    work: (actor: PolicySubject) => Promise<T>,
  ) {
    let actor: PolicySubject;
    try {
      ({ actor } = await this.resources.authorize(resource, action, subject));
      if (
        process.env.NODE_ENV === 'production' ||
        this.config.get('STOCK_RECEIPTS_SYNTHETIC') !== 'true'
      )
        throw notFound();
      return await work(actor);
    } catch (error) {
      const outcome = error instanceof HttpException ? error : unavailable();
      await this.audit.record(
        AuditEvent.STOCK_RECEIPT,
        this.audit.result(outcome),
        'service',
        actor,
        { resource, action },
      );
      throw outcome;
    }
  }

  private intent(actor: PolicySubject, keyHash: string) {
    return { organizationId: oid(actor.organizationId), actorId: oid(actor.id), keyHash };
  }

  private confirmed(scope: ReturnType<StockReceiptsService['intent']>) {
    return this.receipts
      .findOne(scope)
      .collation({ locale: 'simple' })
      .read('primary')
      .readConcern('majority')
      .lean();
  }

  private replay(row: StockReceipt, intentHash: string) {
    if (row.intentHash !== intentHash) throw new ConflictException('Idempotency key already used');
    return { created: false, receipt: view(row) };
  }

  receive(raw: ReceiveStockDto, key: unknown, subject: PolicySubject) {
    return this.execute(receiptResource, create, subject, async (actor) => {
      const rawKeyHash = intentKey(key);
      const data = validated(ReceiveStockDto, raw, [
        'productId',
        'locationId',
        'quantity',
        'reference',
      ]);
      const scope = this.intent(actor, rawKeyHash),
        intentHash = canonicalReceipt(data);
      const known = await this.confirmed(scope);
      if (known) return this.replay(known, intentHash);
      await verifyStockIndexes(this.balances, this.receipts);
      const id = new Types.ObjectId(),
        recordedAt = new Date();
      const session = await this.connection.startSession();
      try {
        const row = await session.withTransaction(
          async () => {
            const { actor } = await this.resources.authorize(receiptResource, create, subject);
            const current = this.intent(actor, rawKeyHash);
            if (
              await this.receipts.exists(current).collation({ locale: 'simple' }).session(session)
            )
              return null;
            const result = await this.apply(data, id, recordedAt, current, intentHash, session);
            await this.audit.record(
              AuditEvent.STOCK_RECEIPT,
              'allowed',
              'service',
              actor,
              {
                resource: receiptResource,
                action: create,
                targetId: id.toString(),
              },
              session,
            );
            return result;
          },
          {
            readPreference: 'primary',
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority', j: true },
            timeoutMS: 10000,
          },
        );
        if (row) return { created: true, receipt: view(row) };
      } catch (error) {
        if (error?.code !== 11000) throw error;
        // A uniqueness error is not itself evidence that this intent committed.
      } finally {
        await session.endSession();
      }
      const { actor: fresh } = await this.resources.authorize(receiptResource, create, subject);
      const committed = await this.confirmed(this.intent(fresh, rawKeyHash));
      if (!committed) throw unavailable();
      return this.replay(committed, intentHash);
    });
  }

  private async apply(
    data: ReceiveStockDto,
    id: Types.ObjectId,
    recordedAt: Date,
    scope: ReturnType<StockReceiptsService['intent']>,
    intentHash: string,
    session: ClientSession,
  ) {
    const { organizationId } = scope,
      productId = oid(data.productId),
      locationId = oid(data.locationId);
    const location = await this.connection.models.StockLocation.exists({
      _id: locationId,
      organizationId,
      status: 'active',
    }).session(session);
    if (!location) throw notFound();
    // Force a write conflict with concurrent catalog state transitions on the same product.
    const product = await this.connection.models.Product.findOneAndUpdate(
      {
        _id: productId,
        organizationId,
        archivedAt: null,
        accessState: 'active',
        status: 'active',
        ownerId: { $type: 'objectId' },
        createdBy: { $type: 'objectId' },
      },
      { $set: { lastStockReceiptId: id } },
      { session, timestamps: false },
    )
      .select('saleUnit')
      .lean<{ saleUnit: string }>();
    if (!product) throw notFound();
    const unit = unitFor(product.saleUnit);
    const balance = { organizationId, productId, locationId };
    const existing = await this.balances.updateOne(
      { ...balance, quantity: { $gte: 1, $lte: MAX_LOCAL_BALANCE - data.quantity } },
      { $inc: { quantity: data.quantity } },
      { session, collation: { locale: 'simple' } },
    );
    if (!existing.matchedCount) {
      if (await this.balances.exists(balance).collation({ locale: 'simple' }).session(session))
        throw new ConflictException('Stock quantity limit exceeded');
      await this.balances.create([{ ...balance, quantity: data.quantity }], { session });
    }
    const [row] = await this.receipts.create(
      [
        {
          ...balance,
          ...scope,
          _id: id,
          kind: 'receipt',
          quantity: data.quantity,
          unit,
          recordedAt,
          intentHash,
          reference: data.reference,
        },
      ],
      { session },
    );
    return row;
  }

  findIntent(key: unknown, subject: PolicySubject) {
    return this.execute(receiptResource, list, subject, async (actor) => {
      const row = await this.confirmed(this.intent(actor, intentKey(key)));
      if (!row) throw notFound();
      return view(row);
    });
  }

  balance(raw: StockBalanceQueryDto, subject: PolicySubject) {
    return this.execute(PolicyResource.STOCK_BALANCE, list, subject, async (actor) => {
      const query = validated(StockBalanceQueryDto, raw, [
        'productId',
        'locationId',
        'before',
        'limit',
      ]);
      const { before, limit } = query;
      const organizationId = oid(actor.organizationId),
        productId = oid(query.productId);
      const locationId = query.locationId === undefined ? undefined : oid(query.locationId);
      if (locationId && before !== undefined)
        throw new BadRequestException('Cannot combine locationId and before');
      const product = await this.connection.models.Product.findOne({
        _id: productId,
        organizationId,
        ownerId: { $type: 'objectId' },
        createdBy: { $type: 'objectId' },
        accessState: { $in: ['active', 'locked'] },
      })
        .read('primary')
        .readConcern('majority')
        .select('saleUnit')
        .lean<{ saleUnit: string }>();
      if (!product) throw notFound();
      const unit = unitFor(product.saleUnit);
      if (
        locationId &&
        !(await this.connection.models.StockLocation.exists({ _id: locationId, organizationId })
          .read('primary')
          .readConcern('majority'))
      )
        throw notFound();
      const subset: PipelineStage.FacetPipelineStage[] = [];
      if (locationId) subset.push({ $match: { locationId } });
      else if (before !== undefined) subset.push({ $match: { locationId: { $gt: oid(before) } } });
      subset.push(
        { $sort: { locationId: 1 } },
        { $limit: limit + 1 },
        { $project: { _id: 0, locationId: { $toString: '$locationId' }, quantity: 1 } },
      );
      const [result] = await this.balances
        .aggregate<{
          rows: { locationId: string; quantity: number }[];
          total: { quantity: string }[];
        }>([
          { $match: { organizationId, productId } },
          {
            $facet: {
              rows: subset,
              total: [
                // Stored quantities are bounded safe integers; convert to an integer BSON
                // representation before summing so Decimal128 keeps zero fractional scale.
                {
                  $group: {
                    _id: null,
                    quantity: { $sum: { $toDecimal: { $toLong: '$quantity' } } },
                  },
                },
                { $project: { quantity: { $toString: '$quantity' } } },
              ],
            },
          },
        ])
        .read('primary')
        .readConcern('snapshot')
        .collation({ locale: 'simple' });
      const items = result.rows.slice(0, limit);
      if (locationId && !items.length)
        items.push({ locationId: locationId.toString(), quantity: 0 });
      return {
        productId: productId.toString(),
        unit,
        items,
        total: result.total[0]?.quantity ?? '0',
        nextCursor: result.rows.length > limit ? items[items.length - 1].locationId : null,
      };
    });
  }
}
