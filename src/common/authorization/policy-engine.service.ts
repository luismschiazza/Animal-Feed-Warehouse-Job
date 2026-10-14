import { Injectable } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { POLICY_DEFINITIONS } from './policy.registry';
import { PolicyContext, PolicyDecision, PolicyRequirement } from './policy.types';

@Injectable()
export class PolicyEngine {
  evaluate(requirement: PolicyRequirement, context: PolicyContext): PolicyDecision {
    const subject = context.subject;
    if (
      !subject?.id ||
      !subject.sessionId ||
      !Array.isArray(subject.roles) ||
      subject.roles.length === 0 ||
      subject.roles.some((role) => !Object.values(Role).includes(role))
    ) {
      return { allowed: false, reason: 'invalid_subject' };
    }
    const policy = POLICY_DEFINITIONS.find(
      (candidate) =>
        candidate.action === requirement.action && candidate.resource === requirement.resource,
    );
    if (!policy) return { allowed: false, reason: 'missing_policy' };
    if (
      context.resource.type !== requirement.resource ||
      !policy.roles.some((role) => subject.roles.includes(role))
    ) {
      return { allowed: false, reason: 'denied' };
    }
    if (policy.condition && !policy.condition(context)) return { allowed: false, reason: 'denied' };
    return { allowed: true, reason: 'allowed' };
  }
}
