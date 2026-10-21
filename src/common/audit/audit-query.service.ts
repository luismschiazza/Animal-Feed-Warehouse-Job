import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '@/features/auth/services/auth.service';
import { PolicyEngine } from '../authorization/policy-engine.service';
import {
  PolicyAction,
  PolicyResource,
  PolicyResourceAttributes,
  PolicySubject,
} from '../authorization/policy.types';
import { AuditEvent } from './security-audit.schema';
import { SecurityAuditService } from './security-audit.service';

@Injectable()
export class AuditQueryService {
  constructor(
    private readonly auth: AuthService,
    private readonly engine: PolicyEngine,
    private readonly audit: SecurityAuditService,
  ) {}
  async authorize(resource: PolicyResource, subject: PolicySubject) {
    let actor: PolicySubject;
    try {
      if (!subject?.id || !subject.sessionId) throw new UnauthorizedException();
      const identity = await this.auth.validateSession(subject.id, subject.sessionId);
      if (identity.organizationId !== subject.organizationId) throw new UnauthorizedException();
      actor = { ...identity, sessionId: subject.sessionId };
      if (![PolicyResource.AUDIT_EVENT, PolicyResource.OWN_AUDIT_EVENT].includes(resource))
        throw new ForbiddenException();
      const attributes: PolicyResourceAttributes = {
        type: resource,
        ownerId: actor.id,
        organizationId: actor.organizationId,
        accessState: 'active',
      };
      if (
        !this.engine.evaluate(
          { resource, action: PolicyAction.LIST },
          { subject: actor, resource: attributes, environment: { method: 'GET' } },
        ).allowed
      )
        throw new ForbiddenException('Audit access denied');
      await this.audit.record(AuditEvent.AUTHORIZATION, 'allowed', 'service', actor, {
        resource,
        action: PolicyAction.LIST,
      });
      return { actor, attributes };
    } catch (error) {
      await this.audit.record(
        AuditEvent.AUTHORIZATION,
        this.audit.result(error),
        'service',
        actor,
        { resource, action: PolicyAction.LIST },
      );
      throw error;
    }
  }
  async list(resource: PolicyResource, subject: PolicySubject, limit?: number, before?: string) {
    const { actor } = await this.authorize(resource, subject);
    return this.audit.page(
      resource === PolicyResource.AUDIT_EVENT
        ? { kind: 'organization', id: actor.organizationId }
        : { kind: 'user', id: actor.id },
      limit,
      before,
    );
  }
}
