import { Module } from '@nestjs/common';
import { ProductsController } from './controllers/products.controller';
import { ProductModelModule } from './models/product-model.module';
import { ProductsService } from './services/products.service';

@Module({
  imports: [ProductModelModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
