import { ServiceUnavailableException } from '@nestjs/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

export enum StockLocationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Schema({
  collection: 'stocklocations',
  timestamps: true,
  versionKey: false,
  autoCreate: false,
  autoIndex: false,
})
export class StockLocation {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, immutable: true })
  organizationId: Types.ObjectId;

  @Prop({ type: String, immutable: true, required: true, match: /^[A-Z0-9][A-Z0-9._-]{0,31}$/ })
  code: string;

  @Prop({ type: String, trim: true, required: true, maxlength: 120, match: /^[^\p{Cc}]+$/u })
  name: string;

  @Prop({ type: String, required: true, enum: Object.values(StockLocationStatus) })
  status: StockLocationStatus;
}

export const StockLocationSchema = SchemaFactory.createForClass(StockLocation);
StockLocationSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, name: 'stock_location_org_code_unique', collation: { locale: 'simple' } },
);
StockLocationSchema.index(
  { organizationId: 1, _id: -1 },
  { name: 'stock_location_org_page', collation: { locale: 'simple' } },
);

export async function verifyStockLocationIndexes(model: Model<StockLocation>) {
  try {
    const indexes = await model.collection.listIndexes().toArray();
    const compatible = (field: 'code' | '_id', order: 1 | -1, unique: boolean) =>
      indexes.some(
        (index) =>
          Object.keys(index.key).join(',') === 'organizationId,' + field &&
          index.key.organizationId === 1 &&
          index.key[field] === order &&
          (index.unique === true) === unique &&
          !index.hidden &&
          !index.sparse &&
          !index.partialFilterExpression &&
          index.expireAfterSeconds === undefined &&
          (!index.collation || index.collation.locale === 'simple'),
      );
    if (!compatible('code', 1, true) || !compatible('_id', -1, false))
      throw new Error('Missing stock location indexes');
  } catch {
    throw new ServiceUnavailableException('Stock location storage is not initialized');
  }
}
