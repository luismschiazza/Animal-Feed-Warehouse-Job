import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@/common/authorization/policy.decorators';
import { OperationsService } from './operations.service';

@Public()
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly operations: OperationsService) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    if (!(await this.operations.ready())) throw new ServiceUnavailableException();
    return { status: 'ok' };
  }
}
