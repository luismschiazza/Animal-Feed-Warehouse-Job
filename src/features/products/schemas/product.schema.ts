import { ServiceUnavailableException } from '@nestjs/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { addTenantFields } from '@/common/authorization/tenant-schema';
import {
  ProductCategory,
  ProductStatus,
  SaleUnit,
  TargetSpecies,
} from '../dtos/validation/create-product.dto';

@Schema({
  collection: 'products',
  timestamps: true,
  versionKey: false,
  autoCreate: false,
  autoIndex: false,
})
export class Product {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  ownerId: Types.ObjectId;
  createdBy: Types.ObjectId;
  accessState: 'active' | 'locked';
  createdAt: Date;
  updatedAt: Date;
  @Prop({ type: String, required: true, immutable: true, match: /^[A-Z0-9][A-Z0-9._-]{0,63}$/ })
  sku: string;
  @Prop({ type: String, required: true, trim: true, maxlength: 160 }) name: string;
  @Prop({ type: String, maxlength: 1000 }) description?: string;
  @Prop({ type: String, maxlength: 80 }) brand?: string;
  @Prop({ type: String, required: true, enum: Object.values(ProductCategory) })
  category: ProductCategory;
  @Prop({ type: String, required: true, enum: Object.values(TargetSpecies) })
  targetSpecies: TargetSpecies;
  @Prop({ type: String, required: true, immutable: true, enum: Object.values(SaleUnit) })
  saleUnit: SaleUnit;
  @Prop({ type: Number, required: true, min: 1, max: 100000000, validate: Number.isSafeInteger })
  priceCents: number;
  @Prop({ type: Number, min: 1, max: 1000000, validate: Number.isSafeInteger })
  packageWeightGrams?: number;
  @Prop({
    type: String,
    required: true,
    enum: Object.values(ProductStatus),
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;
  @Prop({ type: Date, default: null }) archivedAt: Date | null;
}
export const ProductSchema = SchemaFactory.createForClass(Product);
addTenantFields(ProductSchema);
ProductSchema.index(
  { organizationId: 1, sku: 1 },
  { unique: true, name: 'product_org_sku_unique', collation: { locale: 'simple' } },
);
export async function verifyProductIndexes(model: Model<Product>) {
  try {
    const indexes = await model.collection.listIndexes().toArray();
    if (
      !indexes.some(
        (index) =>
          Object.keys(index.key).length === 2 &&
          index.key.organizationId === 1 &&
          index.key.sku === 1 &&
          index.unique === true &&
          !index.sparse &&
          !index.partialFilterExpression &&
          !index.expireAfterSeconds &&
          (!index.collation || index.collation.locale === 'simple'),
      )
    )
      throw new Error('Missing unique product index');
  } catch {
    throw new ServiceUnavailableException('Product storage is not initialized');
  }
}
