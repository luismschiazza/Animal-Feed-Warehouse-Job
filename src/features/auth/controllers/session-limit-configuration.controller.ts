import { BadRequestException, Body, Controller, Get, Patch, Query, Request } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import { RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import {
  MAX_ORGANIZATION_SESSION_LIMIT,
  MAX_SESSION_LIMIT_VERSION,
} from '../schemas/session-limit-revision.schema';
import { SessionLimitConfigurationService } from '../services/session-limit-configuration.service';

export class UpdateSessionLimitConfigurationDto {
  @IsInt() @Min(1) @Max(MAX_ORGANIZATION_SESSION_LIMIT) limit: number;
  @IsInt() @Min(0) @Max(MAX_SESSION_LIMIT_VERSION - 1) expectedVersion: number;
}
@Controller('auth/organization-session-limit')
export class SessionLimitConfigurationController {
  constructor(private readonly configuration: SessionLimitConfigurationService) {}
  @Get()
  @RequirePolicies({
    resource: PolicyResource.SESSION_LIMIT_CONFIGURATION,
    action: PolicyAction.READ,
  })
  read(@Request() req, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException('Query parameters not supported');
    return this.configuration.read(req.user);
  }
  @Patch()
  @RequirePolicies({
    resource: PolicyResource.SESSION_LIMIT_CONFIGURATION,
    action: PolicyAction.UPDATE,
  })
  update(
    @Request() req,
    @Query() query: Record<string, unknown>,
    @Body() body: UpdateSessionLimitConfigurationDto,
  ) {
    if (Object.keys(query).length) throw new BadRequestException('Query parameters not supported');
    return this.configuration.update(req.user, body);
  }
}
