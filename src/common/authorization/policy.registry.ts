import { Role } from '../enums/role.enum';
import { PolicyAction, PolicyDefinition, PolicyResource } from './policy.types';

const ownResource = (context: Parameters<NonNullable<PolicyDefinition['condition']>>[0]) =>
  context.resource.ownerId === context.subject.id;

const scopedResource = (context: Parameters<NonNullable<PolicyDefinition['condition']>>[0]) =>
  !!context.subject.organizationId &&
  !!context.subject.membershipId &&
  context.subject.organizationStatus === 'active' &&
  context.subject.membershipStatus === 'active' &&
  context.resource.organizationId === context.subject.organizationId &&
  ['active', 'locked'].includes(context.resource.accessState);

const administrativeActions = [
  PolicyAction.CREATE,
  PolicyAction.LIST,
  PolicyAction.READ,
  PolicyAction.UPDATE,
  PolicyAction.DELETE,
] as const;
const legacyResources = [
  PolicyResource.LEGACY_DISCIPLINE,
  PolicyResource.LEGACY_ATTENDANCE,
  PolicyResource.LEGACY_GRADE,
  PolicyResource.LEGACY_MEETING,
] as const;

// Central, server-controlled registry. No wildcard, role inheritance or admin bypass.
export const POLICY_DEFINITIONS: readonly PolicyDefinition[] = [
  ...administrativeActions
    .filter((action) => action !== PolicyAction.CREATE)
    .map((action) => ({
      resource: PolicyResource.USER,
      action,
      roles: [Role.SYSTEM_ADMIN],
      // Tenant administrators cannot mutate/delete shared global credentials.
      condition: (context) =>
        scopedResource(context) && [PolicyAction.LIST, PolicyAction.READ].includes(action),
    })),
  {
    resource: PolicyResource.PROFILE,
    action: PolicyAction.READ,
    roles: Object.values(Role),
    condition: ownResource,
  },
  {
    resource: PolicyResource.SESSION,
    action: PolicyAction.REVOKE,
    roles: Object.values(Role),
    condition: ownResource,
  },
  {
    resource: PolicyResource.SESSION,
    action: PolicyAction.LIST,
    roles: Object.values(Role),
    // Collection scope is the authenticated account, never a client-supplied user ID.
    condition: ownResource,
  },
  ...[PolicyAction.REVOKE_OTHERS, PolicyAction.REVOKE_ALL].map((action) => ({
    resource: PolicyResource.SESSION,
    action,
    roles: Object.values(Role),
    condition: ownResource,
  })),
  ...[PolicyAction.LIST, PolicyAction.REVOKE, PolicyAction.REVOKE_ALL].map((action) => ({
    resource: PolicyResource.ORGANIZATION_SESSION,
    action,
    roles: [Role.SYSTEM_ADMIN],
    condition: scopedResource,
  })),
  ...legacyResources.flatMap((resource) =>
    administrativeActions.map((action) => ({
      resource,
      action,
      roles: [Role.SYSTEM_ADMIN, Role.MANAGER],
      condition: (context) =>
        scopedResource(context) &&
        (![PolicyAction.UPDATE, PolicyAction.DELETE].includes(action) ||
          context.resource.accessState === 'active'),
    })),
  ),
];
