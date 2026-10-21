import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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
  @ApiOperation({ summary: 'List my active sessions without credentials' })
  @RequirePolicies({ resource: PolicyResource.SESSION, action: PolicyAction.LIST })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  list(@Request() request, @Query() query: ListSessionsDto) {
    return this.management.listOwn(request.user, query.limit, query.before);
  }
  @Delete('others')
  @RequirePolicies({ resource: PolicyResource.SESSION, action: PolicyAction.REVOKE_OTHERS })
  revokeOthers(@Request() request) {
    return this.management.revokeOwnAll(request.user, true);
  }
  @Delete()
  @RequirePolicies({ resource: PolicyResource.SESSION, action: PolicyAction.REVOKE_ALL })
  revokeAll(@Request() request) {
    return this.management.revokeOwnAll(request.user, false);
  }
  @Delete(':id')
  @RequirePolicies({ resource: PolicyResource.SESSION, action: PolicyAction.REVOKE })
  revoke(@Request() request, @Param('id') id: string) {
    return this.management.revokeOwn(request.user, id);
  }
}

@ApiTags('Organization sessions')
@Controller('auth/organization-sessions')
export class OrganizationSessionsController {
  constructor(private readonly management: SessionManagementService) {}
  @Get()
  @RequirePolicies({ resource: PolicyResource.ORGANIZATION_SESSION, action: PolicyAction.LIST })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  list(@Request() request, @Query() query: ListSessionsDto) {
    return this.management.listOrganization(request.user, query.limit, query.before);
  }
  @Delete()
  @RequirePolicies({
    resource: PolicyResource.ORGANIZATION_SESSION,
    action: PolicyAction.REVOKE_ALL,
  })
  revokeAll(@Request() request) {
    return this.management.revokeOrganizationAll(request.user);
  }
  @Delete(':id')
  @RequirePolicies({ resource: PolicyResource.ORGANIZATION_SESSION, action: PolicyAction.REVOKE })
  revoke(@Request() request, @Param('id') id: string) {
    return this.management.revokeOrganization(request.user, id);
  }
}
