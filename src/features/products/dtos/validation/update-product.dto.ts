import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

// SKU and unit are identity/price interpretation, not freely editable catalog fields.
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['sku', 'saleUnit'] as const),
  { skipNullProperties: false },
) {}
