import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isObservable, lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '@/features/auth/guards/jwt-auth.guard';
import { PolicyEngine } from './policy-engine.service';
import { POLICIES_KEY, PUBLIC_ROUTE_KEY } from './policy.decorators';
import { PolicyContext, PolicyRequirement, PolicyResource } from './policy.types';

@Injectable()
export class PoliciesGuard extends JwtAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly engine: PolicyEngine,
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
      const ownResource =
        requirement.resource === PolicyResource.PROFILE ||
        requirement.resource === PolicyResource.SESSION;
      const policyContext: PolicyContext = {
        subject: request.user,
        // Until a trusted resource loader and scoped services are in place, tenant
        // resources have no organizationId and fail closed. Never copy the subject's
        // organizationId here as proof that an arbitrary resource ID belongs to it.
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
      if (!this.engine.evaluate(requirement, policyContext).allowed) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
    return true;
  }
}
