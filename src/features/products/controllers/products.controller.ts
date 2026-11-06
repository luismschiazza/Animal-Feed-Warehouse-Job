import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import { ValidateObjectIdPipe } from '@/common/pipes/validate-object-id.pipe';
import { ProductDto } from '../dtos/response/product.dto';
import { CreateProductDto } from '../dtos/validation/create-product.dto';
import { ListProductsDto } from '../dtos/validation/list-products.dto';
import { UpdateProductDto } from '../dtos/validation/update-product.dto';
import { ProductsService } from '../services/products.service';

@Controller('products')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
  }),
)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  private view(row) {
    return plainToInstance(ProductDto, typeof row.toObject === 'function' ? row.toObject() : row, {
      excludeExtraneousValues: true,
    });
  }

  @Post()
  @RequirePolicies({ action: PolicyAction.CREATE, resource: PolicyResource.PRODUCT })
  @ApiCreatedResponse({ type: ProductDto })
  async create(@Request() req, @Body() dto: CreateProductDto) {
    return this.view(await this.products.create(dto, req.user));
  }

  @Get()
  @RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.PRODUCT })
  @ApiOkResponse({ description: 'Bounded product page: items and nextCursor' })
  async list(@Request() req, @Query() query: ListProductsDto) {
    const page = await this.products.list(query, req.user);
    return { items: page.items.map((row) => this.view(row)), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.PRODUCT })
  @ApiOkResponse({ type: ProductDto })
  async get(@Request() req, @Param('id', ValidateObjectIdPipe) id: string) {
    return this.view(await this.products.get(id, req.user));
  }

  @Patch(':id')
  @RequirePolicies({ action: PolicyAction.UPDATE, resource: PolicyResource.PRODUCT })
  @ApiOkResponse({ type: ProductDto })
  async update(
    @Request() req,
    @Param('id', ValidateObjectIdPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.view(await this.products.update(id, dto, req.user));
  }

  @Delete(':id')
  @RequirePolicies({ action: PolicyAction.DELETE, resource: PolicyResource.PRODUCT })
  @ApiOkResponse({ type: ProductDto, description: 'Archived product; SKU remains reserved' })
  async archive(@Request() req, @Param('id', ValidateObjectIdPipe) id: string) {
    return this.view(await this.products.archive(id, req.user));
  }
}
