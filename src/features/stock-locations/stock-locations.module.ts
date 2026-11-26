import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  Query,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiOkResponse } from '@nestjs/swagger';
import { RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { CreateStockLocationDto, ListStockLocationsDto } from './stock-location.dto';
import { StockLocation, StockLocationSchema } from './stock-location.schema';
import { StockLocationsService } from './stock-locations.service';

@Controller('stock-locations')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  }),
)
export class StockLocationsController {
  constructor(private readonly locations: StockLocationsService) {}

  @Post()
  @RequirePolicies({ resource: PolicyResource.STOCK_LOCATION, action: PolicyAction.CREATE })
  create(@Request() req: { user: PolicySubject }, @Body() data: CreateStockLocationDto) {
    return this.locations.create(data, req.user);
  }

  @Get()
  @RequirePolicies({ resource: PolicyResource.STOCK_LOCATION, action: PolicyAction.LIST })
  @ApiOkResponse({ description: 'Tenant stock location page: items and nextCursor; no quantities' })
  list(@Request() req: { user: PolicySubject }, @Query() query: ListStockLocationsDto) {
    return this.locations.list(query, req.user);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: StockLocation.name, schema: StockLocationSchema }])],
  controllers: [StockLocationsController],
  providers: [StockLocationsService],
})
export class StockLocationsModule {}
