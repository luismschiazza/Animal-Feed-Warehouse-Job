import { Expose, Transform } from 'class-transformer';

export class ProductDto {
  @Expose() @Transform(({ obj }) => (obj._id ?? obj.id)?.toString()) id: string;
  @Expose() sku: string;
  @Expose() name: string;
  @Expose() description?: string;
  @Expose() brand?: string;
  @Expose() category: string;
  @Expose() targetSpecies: string;
  @Expose() saleUnit: string;
  @Expose() priceCents: number;
  @Expose() packageWeightGrams?: number;
  @Expose() status: string;
  @Expose() archivedAt: Date | null;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
}
