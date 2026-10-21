import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isObservable, lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '@/features/auth/guards/jwt-auth.guard';
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
    if (isPublic) {
      if (requirements !== undefined)
        throw new ForbiddenException('Conflicting authorization metadata');
      return true;
    }
    // Passport validates signature, expiry and the session before policy evaluation.
    const authentication = super.canActivate(context);
    const authenticated = isObservable(authentication)
      ? await lastValueFrom(authentication)
      : await authentication;
    if (!authenticated) return false;
    if (!requirements?.length) throw new ForbiddenException('No authorization policy declared');
    const request = context.switchToHttp().getRequest();
    for (const requirement of requirements) {
      // SESSION currently covers own collection and current logout only. A future
      // parameterized target must get a real loader, not inherit the current owner.
      if (
        requirement.resource === PolicyResource.SESSION &&
        Object.keys(request.params ?? {}).length
      ) {
        throw new ForbiddenException('Session target authorization not configured');
      }
      const ownResource =
        requirement.resource === PolicyResource.PROFILE ||
        requirement.resource === PolicyResource.SESSION;
      const policyContext: PolicyContext = {
        subject: request.user,
        // Owned profile/logout use the authenticated identity. Other attributes are
        // resolved below from scoped DB records or validated collection scope.
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
      if (!ownResource) {
        const authorization = await this.resources.authorize(
          requirement.resource,
          requirement.action,
          request.user,
          request.params?.id,
        );
        policyContext.resource = authorization.attributes;
        policyContext.subject = authorization.actor;
      }
      if (!this.engine.evaluate(requirement, policyContext).allowed) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
    return true;
  }
}
