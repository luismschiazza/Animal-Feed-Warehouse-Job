import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Module,
  Post,
  Query,
  Request,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Response } from 'express';
import { RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { StockLocationsModule } from '@/features/stock-locations/stock-locations.module';
import { ReceiveStockDto, StockBalanceQueryDto } from './stock-receipt.dto';
import {
  BALANCE_MODEL,
  RECEIPT_MODEL,
  StockBalanceSchema,
  StockReceiptSchema,
} from './stock-receipt.schema';
import { StockReceiptsService } from './stock-receipts.service';

@Controller()
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  }),
)
export class StockReceiptsController {
  constructor(private readonly stock: StockReceiptsService) {}

  @Post('stock-receipts')
  @Header('Cache-Control', 'no-store')
  @RequirePolicies({ resource: PolicyResource.STOCK_RECEIPT, action: PolicyAction.CREATE })
  async receive(
    @Request() req: { user: PolicySubject },
    @Body() dto: ReceiveStockDto,
    @Headers('idempotency-key') key: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, receipt } = await this.stock.receive(dto, key, req.user);
    res.status(created ? 201 : 200);
    return receipt;
  }

  @Get('stock-receipts/by-intent')
  @Header('Cache-Control', 'no-store')
  @RequirePolicies({ resource: PolicyResource.STOCK_RECEIPT, action: PolicyAction.LIST })
  findIntent(@Request() req: { user: PolicySubject }, @Headers('idempotency-key') key: unknown) {
    return this.stock.findIntent(key, req.user);
  }

  @Get('stock-balances')
  @Header('Cache-Control', 'no-store')
  @RequirePolicies({ resource: PolicyResource.STOCK_BALANCE, action: PolicyAction.LIST })
  balance(@Request() req: { user: PolicySubject }, @Query() query: StockBalanceQueryDto) {
    return this.stock.balance(query, req.user);
  }
}

@Module({
  imports: [
    StockLocationsModule,
    MongooseModule.forFeature([
      { name: BALANCE_MODEL, schema: StockBalanceSchema },
      { name: RECEIPT_MODEL, schema: StockReceiptSchema },
    ]),
  ],
  controllers: [StockReceiptsController],
  providers: [StockReceiptsService],
})
export class StockReceiptsModule {}
