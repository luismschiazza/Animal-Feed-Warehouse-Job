import { Role } from '../enums/role.enum';
import { PolicyEngine } from './policy-engine.service';
import { POLICY_DEFINITIONS } from './policy.registry';
import { PolicyAction, PolicyContext, PolicyResource } from './policy.types';

const engine = new PolicyEngine();
function context(roles: Role[], resource: PolicyResource, ownerId = 'user'): PolicyContext {
  return {
    subject: { id: 'user', sessionId: 'session', roles },
    resource: { type: resource, ownerId },
    environment: { method: 'GET' },
  };
}

describe('PolicyEngine — explicit registry', () => {
  it.each(POLICY_DEFINITIONS.map((policy) => [policy.resource, policy.action, policy] as const))(
    'allows the explicitly configured role for %s:%s',
    (_resource, _action, policy) => {
      expect(engine.evaluate(policy, context([policy.roles[0]], policy.resource))).toEqual({
        allowed: true,
        reason: 'allowed',
      });
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
  it('contains no duplicate policy identifiers', () => {
    const ids = POLICY_DEFINITIONS.map((policy) => `${policy.resource}:${policy.action}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
