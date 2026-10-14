import { Role } from '../enums/role.enum';
import { PolicyAction, PolicyDefinition, PolicyResource } from './policy.types';

const ownResource = (context: Parameters<NonNullable<PolicyDefinition['condition']>>[0]) =>
  context.resource.ownerId === context.subject.id;

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
  ...legacyResources.flatMap((resource) =>
    administrativeActions.map((action) => ({
      resource,
      action,
      roles: [Role.SYSTEM_ADMIN, Role.MANAGER],
    })),
  ),
];
