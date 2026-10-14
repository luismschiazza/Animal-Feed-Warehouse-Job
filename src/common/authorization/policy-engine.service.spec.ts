import { AccountStatus } from '../enums/account-status.enum';
import { Role } from '../enums/role.enum';
import { PolicyEngine } from './policy-engine.service';
import { POLICY_DEFINITIONS } from './policy.registry';
import { PolicyAction, PolicyContext, PolicyResource } from './policy.types';

const engine = new PolicyEngine();
function context(roles: Role[], resource: PolicyResource, ownerId = 'user'): PolicyContext {
  return {
    subject: {
      id: 'user',
      sessionId: 'session',
      roles,
      status: AccountStatus.ACTIVE,
      organizationId: 'organization-A',
      membershipId: 'membership-A',
      organizationStatus: 'active',
      membershipStatus: 'active',
    },
    resource: { type: resource, ownerId, organizationId: 'organization-A', accessState: 'active' },
    environment: { method: 'GET' },
  };
}

describe('PolicyEngine — explicit registry', () => {
  it.each(POLICY_DEFINITIONS.map((policy) => [policy.resource, policy.action, policy] as const))(
    'allows the explicitly configured role for %s:%s',
    (_resource, _action, policy) => {
      const blockedGlobalWrite =
        policy.resource === PolicyResource.USER &&
        [PolicyAction.UPDATE, PolicyAction.DELETE].includes(policy.action);
      expect(engine.evaluate(policy, context([policy.roles[0]], policy.resource)).allowed).toBe(
        !blockedGlobalWrite,
      );
    },
  );
  it.each(POLICY_DEFINITIONS.map((policy) => [policy.resource, policy.action, policy] as const))(
    'denies unauthorized role or ownership for %s:%s',
    (_resource, _action, policy) => {
      const roles = policy.condition ? [Role.CUSTOMER] : [Role.INVENTORY_OPERATOR];
      expect(engine.evaluate(policy, context(roles, policy.resource, 'someone-else')).allowed).toBe(
        false,
      );
    },
  );
  it('does not give SYSTEM_ADMIN implicit permissions or accept mismatched resource attributes', () => {
    expect(
      engine.evaluate(
        { resource: PolicyResource.SESSION, action: PolicyAction.DELETE },
        context([Role.SYSTEM_ADMIN], PolicyResource.SESSION),
      ),
    ).toEqual({ allowed: false, reason: 'missing_policy' });
    expect(
      engine.evaluate(
        { resource: PolicyResource.USER, action: PolicyAction.READ },
        context([Role.SYSTEM_ADMIN], PolicyResource.LEGACY_GRADE),
      ).allowed,
    ).toBe(false);
  });
  it('rejects missing roles, invalid roles and subjects without a session', () => {
    const policy = { resource: PolicyResource.PROFILE, action: PolicyAction.READ };
    for (const roles of [[], ['FAKE_ROLE'] as unknown as Role[]]) {
      expect(engine.evaluate(policy, context(roles, policy.resource)).reason).toBe(
        'invalid_subject',
      );
    }
    const input = context([Role.CUSTOMER], policy.resource);
    input.subject.sessionId = '';
    expect(engine.evaluate(policy, input).allowed).toBe(false);
  });
  it('denies tenant resources without scope, with cross-tenant attributes or inactive linkage', () => {
    const policy = { resource: PolicyResource.USER, action: PolicyAction.READ };
    const missingScope = context([Role.SYSTEM_ADMIN], policy.resource);
    missingScope.resource.organizationId = undefined;
    expect(engine.evaluate(policy, missingScope).allowed).toBe(false);
    const crossTenant = context([Role.SYSTEM_ADMIN], policy.resource);
    crossTenant.resource.organizationId = 'organization-B';
    expect(engine.evaluate(policy, crossTenant).allowed).toBe(false);
    const suspended = context([Role.SYSTEM_ADMIN], policy.resource);
    suspended.subject.membershipStatus = 'suspended';
    expect(engine.evaluate(policy, suspended).allowed).toBe(false);
    suspended.subject.membershipStatus = 'active';
    suspended.subject.organizationStatus = 'suspended';
    expect(engine.evaluate(policy, suspended).allowed).toBe(false);
  });

  it('ownership never bypasses roles, tenant scope or a locked resource', () => {
    const policy = { resource: PolicyResource.LEGACY_GRADE, action: PolicyAction.UPDATE };
    const input = context([Role.MANAGER], policy.resource);
    expect(engine.evaluate(policy, input).allowed).toBe(true);
    input.resource.accessState = 'locked';
    expect(engine.evaluate(policy, input).allowed).toBe(false);
    input.resource.accessState = 'active';
    input.subject.roles = [Role.CUSTOMER];
    expect(engine.evaluate(policy, input).allowed).toBe(false);
    input.subject.roles = [Role.MANAGER];
    input.resource.organizationId = 'organization-B';
    expect(engine.evaluate(policy, input).allowed).toBe(false);
  });

  it('denies inactive accounts even on own profile policies', () => {
    const policy = { resource: PolicyResource.PROFILE, action: PolicyAction.READ };
    const input = context([Role.CUSTOMER], policy.resource);
    input.subject.status = AccountStatus.SUSPENDED;
    expect(engine.evaluate(policy, input).reason).toBe('invalid_subject');
  });

  it('contains no duplicate policy identifiers', () => {
    const ids = POLICY_DEFINITIONS.map((policy) => `${policy.resource}:${policy.action}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
