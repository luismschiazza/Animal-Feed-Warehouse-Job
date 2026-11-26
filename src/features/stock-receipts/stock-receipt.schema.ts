import { ServiceUnavailableException } from '@nestjs/common';
import { Model, Schema, Types } from 'mongoose';
import { MAX_LOCAL_BALANCE, MAX_RECEIPT } from './stock-receipt.dto';

export type StockUnit = 'unit' | 'g';
export interface StockBalance {
  organizationId: Types.ObjectId;
  productId: Types.ObjectId;
  locationId: Types.ObjectId;
  quantity: number;
}
export interface StockReceipt extends StockBalance {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  keyHash: string;
  intentHash: string;
  kind: 'receipt';
  unit: StockUnit;
  recordedAt: Date;
  reference?: string;
}

export const BALANCE_MODEL = 'StockBalance';
export const RECEIPT_MODEL = 'StockReceipt';
const oid = { type: Schema.Types.ObjectId, required: true, immutable: true } as const;
const key = { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true } as const;
const ids = { organizationId: oid, productId: oid, locationId: oid };
const options = { autoCreate: false, autoIndex: false, versionKey: false } as const;
const balanceIndex = { organizationId: 1, productId: 1, locationId: 1 } as const;
const receiptIndex = { organizationId: 1, actorId: 1, keyHash: 1 } as const;
export const StockBalanceSchema = new Schema<StockBalance>(
  {
    ...ids,
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_LOCAL_BALANCE,
      validate: Number.isSafeInteger,
    },
  },
  { ...options, collection: 'stockbalances' },
);
export const StockReceiptSchema = new Schema<StockReceipt>(
  {
    ...ids,
    actorId: oid,
    keyHash: key,
    intentHash: key,
    kind: { type: String, enum: ['receipt'], required: true, immutable: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_RECEIPT,
      validate: Number.isSafeInteger,
      immutable: true,
    },
    unit: { type: String, enum: ['unit', 'g'], required: true, immutable: true },
    recordedAt: { type: Date, required: true, immutable: true },
    reference: { type: String, maxlength: 120, immutable: true },
  },
  { ...options, collection: 'stockreceipts' },
);
StockBalanceSchema.index(balanceIndex, {
  unique: true,
  name: 'stock_balance_org_product_location',
  collation: { locale: 'simple' },
});
StockReceiptSchema.index(receiptIndex, {
  unique: true,
  name: 'stock_receipt_org_actor_intent',
  collation: { locale: 'simple' },
});

export async function verifyStockIndexes(
  balance: Model<StockBalance>,
  receipt: Model<StockReceipt>,
) {
  try {
    const hasIndex = async (
      model: Model<StockBalance> | Model<StockReceipt>,
      key: Record<string, number>,
    ) =>
      (await model.collection.listIndexes().toArray()).some(
        (index) =>
          JSON.stringify(index.key) === JSON.stringify(key) &&
          index.unique === true &&
          !index.hidden &&
          !index.sparse &&
          !index.partialFilterExpression &&
          index.expireAfterSeconds === undefined &&
          (!index.collation || index.collation.locale === 'simple'),
      );
    if (!(await hasIndex(balance, balanceIndex)) || !(await hasIndex(receipt, receiptIndex)))
      throw new Error('Missing stock receive indexes');
  } catch {
    throw new ServiceUnavailableException('Stock storage is not initialized');
  }
}
