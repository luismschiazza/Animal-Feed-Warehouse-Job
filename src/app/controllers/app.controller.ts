import { Controller, Get } from '@nestjs/common';
import { Public } from '@/common/authorization/policy.decorators';
import { AppService } from '../services/app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
