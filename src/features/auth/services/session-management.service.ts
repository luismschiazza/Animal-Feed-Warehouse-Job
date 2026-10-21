import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PolicyEngine } from '@/common/authorization/policy-engine.service';
import {
  PolicyAction,
  PolicyResource,
  PolicyResourceAttributes,
  PolicySubject,
} from '@/common/authorization/policy.types';
import { RevocationAction } from '../schemas/session-revocation.schema';
import { AuthSessionsService } from './auth-sessions.service';
import { AuthService } from './auth.service';
import { SessionRevocationsService } from './session-revocations.service';

@Injectable()
export class SessionManagementService {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: AuthSessionsService,
    private readonly revocations: SessionRevocationsService,
    private readonly engine: PolicyEngine,
  ) {}

  async authorize(
    resource: PolicyResource,
    action: PolicyAction,
    actor: PolicySubject,
    id?: string,
  ) {
    if (!actor?.id || !actor.sessionId) throw new UnauthorizedException('Invalid session context');
    const identity = await this.auth.validateSession(actor.id, actor.sessionId);
    if (identity.organizationId !== actor.organizationId)
      throw new UnauthorizedException('Invalid session context');
    const subject: PolicySubject = { ...identity, sessionId: actor.sessionId };
    if (![PolicyResource.SESSION, PolicyResource.ORGANIZATION_SESSION].includes(resource))
      throw new ForbiddenException('Session access denied');
    const attributes: PolicyResourceAttributes = {
      type: resource,
      ownerId: subject.id,
      organizationId: subject.organizationId,
      accessState: 'active',
    };
    const allowed = () =>
      this.engine.evaluate(
        { resource, action },
        { subject, resource: attributes, environment: { method: action } },
      ).allowed;
    // Deny unauthorized administrative callers before resolving any target's existence.
    if (!allowed()) throw new ForbiddenException('Session access denied');
    const scope =
      resource === PolicyResource.SESSION
        ? { userId: subject.id }
        : { organizationId: subject.organizationId };
    const target =
      action === PolicyAction.REVOKE
        ? await this.sessions.findTarget(id ?? subject.sessionId, scope)
        : undefined;
    if (target) {
      attributes.id = target.sessionId;
      attributes.ownerId = target.userId.toString();
      attributes.organizationId = target.organizationId?.toString();
      if (!allowed()) throw new ForbiddenException('Session access denied');
    }
    return { actor: subject, attributes, target };
  }
  async listOwn(actor: PolicySubject, limit = 25, before?: string) {
    const authorization = await this.authorize(PolicyResource.SESSION, PolicyAction.LIST, actor);
    return this.sessions.listOwnedActive(authorization.actor.id, actor.sessionId, limit, before);
  }
  async revokeOwn(actor: PolicySubject, id: string) {
    const context = await this.authorize(PolicyResource.SESSION, PolicyAction.REVOKE, actor, id);
    return this.revocations.single(context.target, RevocationAction.REVOKE, context.actor);
  }
  async revokeOwnAll(actor: PolicySubject, othersOnly: boolean) {
    const context = await this.authorize(
      PolicyResource.SESSION,
      othersOnly ? PolicyAction.REVOKE_OTHERS : PolicyAction.REVOKE_ALL,
      actor,
    );
    return this.revocations.ownAll(context.actor, othersOnly);
  }
  async listOrganization(actor: PolicySubject, limit = 25, before?: string) {
    const context = await this.authorize(
      PolicyResource.ORGANIZATION_SESSION,
      PolicyAction.LIST,
      actor,
    );
    return this.sessions.listOrganizationActive(
      context.actor.organizationId,
      actor.sessionId,
      limit,
      before,
    );
  }
  async revokeOrganization(actor: PolicySubject, id: string) {
    const context = await this.authorize(
      PolicyResource.ORGANIZATION_SESSION,
      PolicyAction.REVOKE,
      actor,
      id,
    );
    return this.revocations.single(context.target, RevocationAction.ADMIN_REVOKE, context.actor);
  }
  async revokeOrganizationAll(actor: PolicySubject) {
    const context = await this.authorize(
      PolicyResource.ORGANIZATION_SESSION,
      PolicyAction.REVOKE_ALL,
      actor,
    );
    return this.revocations.organizationAll(context.actor);
  }
}
