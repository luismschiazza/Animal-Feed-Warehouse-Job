import { AccountStatus } from '../enums/account-status.enum';
import { Role } from '../enums/role.enum';

export enum PolicyAction {
  CREATE = 'create',
  LIST = 'list',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  REVOKE = 'revoke',
  REVOKE_OTHERS = 'revoke_others',
  REVOKE_ALL = 'revoke_all',
}

export enum PolicyResource {
  USER = 'user',
  AUDIT_EVENT = 'audit_event',
  OWN_AUDIT_EVENT = 'own_audit_event',
  PROFILE = 'profile',
  SESSION = 'session',
  ORGANIZATION_SESSION = 'organization_session',
  SESSION_LIMIT_CONFIGURATION = 'session_limit_configuration',
  LEGACY_DISCIPLINE = 'legacy_discipline',
  LEGACY_ATTENDANCE = 'legacy_attendance',
  LEGACY_GRADE = 'legacy_grade',
  LEGACY_MEETING = 'legacy_meeting',
}

export interface PolicyRequirement {
  action: PolicyAction;
  resource: PolicyResource;
}

export interface PolicySubject {
  id: string;
  roles: Role[];
  sessionId: string;
  status: AccountStatus;
  organizationId?: string;
  membershipId?: string;
  organizationStatus?: 'active' | 'suspended';
  membershipStatus?: 'invited' | 'active' | 'suspended' | 'revoked';
}

export interface PolicyResourceAttributes {
  type: PolicyResource;
  id?: string;
  ownerId?: string;
  creatorId?: string;
  accessState?: 'active' | 'locked';
  organizationId?: string;
}

export interface PolicyContext {
  subject: PolicySubject;
  resource: PolicyResourceAttributes;
  environment: { method: string; ip?: string };
}

export interface PolicyDefinition extends PolicyRequirement {
  roles: readonly Role[];
  condition?: (context: PolicyContext) => boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: 'allowed' | 'invalid_subject' | 'missing_policy' | 'denied';
}
