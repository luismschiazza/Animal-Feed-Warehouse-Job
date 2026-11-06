import { Type } from 'class-transformer';
import { IsInt, IsMongoId, Max, Min, ValidateIf } from 'class-validator';

export class ListProductsDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @ValidateIf((_o, value) => value !== undefined) @IsMongoId() before?: string;
}
