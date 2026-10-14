import { Role } from '../enums/role.enum';

export enum PolicyAction {
  CREATE = 'create',
  LIST = 'list',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  REVOKE = 'revoke',
}

export enum PolicyResource {
  USER = 'user',
  PROFILE = 'profile',
  SESSION = 'session',
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
}

export interface PolicyResourceAttributes {
  type: PolicyResource;
  id?: string;
  ownerId?: string;
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
