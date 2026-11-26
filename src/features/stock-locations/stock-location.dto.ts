import { Transform } from 'class-transformer';
import { IsInt, IsMongoId, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);
export const LOCATION_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export class CreateStockLocationDto {
  @Transform(trim)
  @IsString()
  @Matches(LOCATION_CODE_PATTERN)
  code: string;

  @Transform(trim)
  @IsString()
  @Length(1, 120)
  @Matches(/^[^\p{Cc}]+$/u)
  name: string;
}

export class ListStockLocationsDto {
  @Transform(({ value }) =>
    typeof value === 'string' && /^[0-9]{1,3}$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ValidateIf((_o, value) => value !== undefined)
  @IsMongoId()
  before?: string;
}
