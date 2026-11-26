import { BadRequestException } from '@nestjs/common';
import { Transform, plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { createHash } from 'node:crypto';

export const MAX_RECEIPT = 1_000_000_000;
export const MAX_LOCAL_BALANCE = 1_000_000_000_000;
export const digest = (text: string) => createHash('sha256').update(text).digest('hex');

export function intentKey(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new BadRequestException('Idempotency-Key must be a UUID v4');
  return digest(value.toLowerCase());
}

export function validated<T extends object>(type: new () => T, raw: unknown, fields: string[]) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).some((key) => !fields.includes(key))
  )
    throw new BadRequestException('Invalid stock fields');
  const dto = plainToInstance(type, raw, { enableImplicitConversion: false });
  if (
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })
      .length
  )
    throw new BadRequestException('Invalid stock data');
  return dto;
}

export class ReceiveStockDto {
  @IsMongoId()
  productId: string;
  @IsMongoId()
  locationId: string;
  @IsInt()
  @Min(1)
  @Max(MAX_RECEIPT)
  quantity: number;
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  @Matches(/^[^\p{Cc}]+$/u)
  reference?: string;
}

export class StockBalanceQueryDto {
  @IsMongoId()
  productId: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsMongoId()
  locationId?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsMongoId()
  before?: string;
  @Transform(({ value }) =>
    typeof value === 'string' && /^[0-9]{1,3}$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export function canonicalReceipt(dto: ReceiveStockDto) {
  return digest(
    JSON.stringify([
      1,
      dto.productId.toLowerCase(),
      dto.locationId.toLowerCase(),
      dto.quantity,
      dto.reference ?? null,
    ]),
  );
}
