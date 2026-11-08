import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export enum ProductCategory {
  FEED = 'feed',
  TREAT = 'treat',
  SUPPLEMENT = 'supplement',
  ACCESSORY = 'accessory',
  HYGIENE = 'hygiene',
  OTHER = 'other',
}
export enum TargetSpecies {
  DOG = 'dog',
  CAT = 'cat',
  BIRD = 'bird',
  FISH = 'fish',
  SMALL_PET = 'small_pet',
  EQUINE = 'equine',
  LIVESTOCK = 'livestock',
  OTHER = 'other',
}
export enum SaleUnit {
  UNIT = 'unit',
  KG = 'kg',
}
export enum ProductStatus {
  ACTIVE = 'active',
  DISCONTINUED = 'discontinued',
}
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProductDto {
  @Transform(trim) @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/) sku: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  brand?: string;
  @IsEnum(ProductCategory) category: ProductCategory;
  @IsEnum(TargetSpecies) targetSpecies: TargetSpecies;
  @IsEnum(SaleUnit) saleUnit: SaleUnit;
  @IsInt() @Min(1) @Max(100000000) priceCents: number;
  @ValidateIf((_o, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000000)
  packageWeightGrams?: number;
  @ValidateIf((_o, value) => value !== undefined) @IsEnum(ProductStatus) status?: ProductStatus;
}
