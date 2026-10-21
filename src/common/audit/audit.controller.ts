import { Controller, Get, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { RequirePolicies } from '../authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '../authorization/policy.types';
import { AuditQueryService } from './audit-query.service';

export class ListAuditDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @Matches(/^[a-f0-9]{24}\.(security|revocation)$/) before?: string;
}
@Controller('audit')
export class AuditController {
  constructor(private readonly queries: AuditQueryService) {}
  @Get('own-events')
  @RequirePolicies({ resource: PolicyResource.OWN_AUDIT_EVENT, action: PolicyAction.LIST })
  own(@Req() req, @Query() query: ListAuditDto) {
    return this.queries.list(PolicyResource.OWN_AUDIT_EVENT, req.user, query.limit, query.before);
  }
  @Get('organization-events')
  @RequirePolicies({ resource: PolicyResource.AUDIT_EVENT, action: PolicyAction.LIST })
  organization(@Req() req, @Query() query: ListAuditDto) {
    return this.queries.list(PolicyResource.AUDIT_EVENT, req.user, query.limit, query.before);
  }
}
