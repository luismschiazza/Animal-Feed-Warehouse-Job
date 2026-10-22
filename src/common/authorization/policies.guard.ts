import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isObservable, lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '@/features/auth/guards/jwt-auth.guard';
import { SessionManagementService } from '@/features/auth/services/session-management.service';
import { AuditQueryService } from '../audit/audit-query.service';
import { AuditEvent } from '../audit/security-audit.schema';
import { SecurityAuditService } from '../audit/security-audit.service';
import { PolicyEngine } from './policy-engine.service';
import { POLICIES_KEY, PUBLIC_ROUTE_KEY } from './policy.decorators';
import { PolicyContext, PolicyRequirement, PolicyResource } from './policy.types';
import { ScopedResourcesService } from './scoped-resources.service';

@Injectable()
export class PoliciesGuard extends JwtAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly engine: PolicyEngine,
    private readonly resources: ScopedResourcesService,
    private readonly sessions: SessionManagementService,
    private readonly audit: SecurityAuditService,
    private readonly auditQueries: AuditQueryService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, targets);
    const requirements = this.reflector.getAllAndOverride<PolicyRequirement[]>(
      POLICIES_KEY,
      targets,
    );
    const request = context.switchToHttp().getRequest();
    if (isPublic && requirements === undefined) return true;
    if (isPublic) {
      await this.audit.record(AuditEvent.AUTHORIZATION, 'denied', 'guard');
      throw new ForbiddenException('Conflicting authorization metadata');
    }
    try {
      const authentication = super.canActivate(context);
      const authenticated = isObservable(authentication)
        ? await lastValueFrom(authentication)
        : await authentication;
      if (!authenticated) throw new UnauthorizedException();
    } catch (error) {
      await this.audit.record(AuditEvent.AUTHENTICATION, this.audit.result(error), 'guard');
      throw error;
    }
    let requirement: PolicyRequirement;
    try {
      if (!requirements?.length) throw new ForbiddenException('No authorization policy declared');
      for (requirement of requirements) {
        const ownResource = [PolicyResource.PROFILE, PolicyResource.SESSION].includes(
          requirement.resource,
        );
        const policyContext: PolicyContext = {
          subject: request.user,
          resource: {
            type: requirement.resource,
            id: ownResource
              ? requirement.resource === PolicyResource.SESSION
                ? request.user.sessionId
                : request.user.id
              : request.params?.id,
            ownerId: ownResource ? request.user.id : undefined,
          },
          environment: { method: request.method, ip: request.ip },
        };
        if (
          [
            PolicyResource.SESSION,
            PolicyResource.ORGANIZATION_SESSION,
            PolicyResource.SESSION_LIMIT_CONFIGURATION,
          ].includes(requirement.resource)
        ) {
          const resolved = await this.sessions.authorize(
            requirement.resource,
            requirement.action,
            request.user,
            request.params?.id,
          );
          policyContext.resource = resolved.attributes;
          policyContext.subject = resolved.actor;
        } else if (
          [PolicyResource.AUDIT_EVENT, PolicyResource.OWN_AUDIT_EVENT].includes(
            requirement.resource,
          )
        ) {
          const resolved = await this.auditQueries.authorize(requirement.resource, request.user);
          policyContext.resource = resolved.attributes;
          policyContext.subject = resolved.actor;
        } else if (!ownResource) {
          const resolved = await this.resources.authorize(
            requirement.resource,
            requirement.action,
            request.user,
            request.params?.id,
          );
          policyContext.resource = resolved.attributes;
          policyContext.subject = resolved.actor;
        }
        if (!this.engine.evaluate(requirement, policyContext).allowed)
          throw new ForbiddenException('Insufficient permissions');
        await this.audit.record(
          AuditEvent.AUTHORIZATION,
          'allowed',
          'guard',
          policyContext.subject,
          { ...requirement, targetId: request.params?.id },
        );
      }
    } catch (error) {
      await this.audit.record(
        AuditEvent.AUTHORIZATION,
        this.audit.result(error),
        'guard',
        request.user,
        { ...requirement, targetId: request.params?.id },
      );
      throw error;
    }
    return true;
  }
}
