import { Controller, Get, Query, Request, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import { ListSessionsDto } from '../dtos/validation/list-sessions.dto';
import { SessionManagementService } from '../services/session-management.service';

@ApiTags('Sessions')
@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly management: SessionManagementService) {}

  @Get()
  @ApiOperation({ summary: 'List my active sessions without authentication credentials' })
  @RequirePolicies({ resource: PolicyResource.SESSION, action: PolicyAction.LIST })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  list(@Request() request, @Query() query: ListSessionsDto) {
    return this.management.listOwn(request.user, query.limit, query.before);
  }
}
