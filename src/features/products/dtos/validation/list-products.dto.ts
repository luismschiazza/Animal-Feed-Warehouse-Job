import { Transform, Type } from 'class-transformer';
import { IsInt, IsMongoId, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PRODUCT_SKU_PATTERN, trimProductText } from './product-sku';

export class ListProductsDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @ValidateIf((_o, value) => value !== undefined) @IsMongoId() before?: string;

  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trimProductText)
  @IsString({ message: 'Invalid SKU' })
  @Matches(PRODUCT_SKU_PATTERN, { message: 'Invalid SKU' })
  sku?: string;
}
