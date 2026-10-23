import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditContext } from '@/common/audit/audit-context.service';
import { verifyAuditIndexes } from '@/common/audit/audit-indexes';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import {
  MAX_ORGANIZATION_SESSION_LIMIT,
  MAX_SESSION_LIMIT_VERSION,
  SESSION_LIMIT_APPLICATION,
  SessionLimitRevision,
} from '../schemas/session-limit-revision.schema';
import { readOrganizationSessionLimit } from './session-limit-reader';
import { SessionManagementService } from './session-management.service';
import { SessionSerializationService } from './session-serialization.service';

export function validateSessionLimitUpdate(
  input: unknown,
): asserts input is { limit: number; expectedVersion: number } {
  const value = input as { limit: number; expectedVersion: number };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['limit', 'expectedVersion'].includes(key)) ||
    !Number.isInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > MAX_ORGANIZATION_SESSION_LIMIT ||
    !Number.isInteger(value.expectedVersion) ||
    value.expectedVersion < 0 ||
    value.expectedVersion >= MAX_SESSION_LIMIT_VERSION
  )
    throw new BadRequestException('Invalid session limit configuration');
}

@Injectable()
export class SessionLimitConfigurationService implements OnModuleInit {
  constructor(
    @InjectModel(SessionLimitRevision.name) private readonly revisions: Model<SessionLimitRevision>,
    private readonly authorization: SessionManagementService,
    private readonly audit: SecurityAuditService,
    private readonly context: AuditContext,
    private readonly serialization: SessionSerializationService,
  ) {}
  async onModuleInit() {
    await verifyAuditIndexes(this.revisions);
  }

  private async current(organizationId: string) {
    return readOrganizationSessionLimit(this.revisions, organizationId);
  }
  private response(organizationId: string, value: { limit: number; version: number }) {
    return {
      scope: 'organization' as const,
      applicationId: SESSION_LIMIT_APPLICATION,
      organizationId,
      limit: value.limit,
      version: value.version,
    };
  }
  async read(actor: PolicySubject) {
    const verified = await this.authorization.authorize(
      PolicyResource.SESSION_LIMIT_CONFIGURATION,
      PolicyAction.READ,
      actor,
    );
    return this.response(
      verified.actor.organizationId,
      await this.current(verified.actor.organizationId),
    );
  }
  async update(actor: PolicySubject, input: unknown) {
    let subject: PolicySubject;
    try {
      const verified = await this.authorization.authorize(
        PolicyResource.SESSION_LIMIT_CONFIGURATION,
        PolicyAction.UPDATE,
        actor,
      );
      subject = verified.actor;
      validateSessionLimitUpdate(input);
      return await this.serialization.run(async (session, serverNow) => {
        const current = await readOrganizationSessionLimit(
          this.revisions,
          subject.organizationId,
          session,
        );
        if (current.version !== input.expectedVersion)
          throw new ConflictException('Session limit version conflict');
        // Serialize configuration against admission/revocation; retain unique successor/version checks.
        const [saved] = await this.revisions.create(
          [
            {
              applicationId: SESSION_LIMIT_APPLICATION,
              organizationId: new Types.ObjectId(subject.organizationId),
              limit: input.limit,
              previousLimit: current.limit,
              version: current.version + 1,
              actorUserId: new Types.ObjectId(subject.id),
              membershipId: new Types.ObjectId(subject.membershipId),
              roles: [...subject.roles],
              requestId: this.context.get().requestId,
              occurredAt: serverNow,
            },
          ],
          { session },
        );
        await this.audit.record(
          AuditEvent.SESSION_LIMIT_CONFIGURATION,
          'allowed',
          'service',
          subject,
          {
            resource: PolicyResource.SESSION_LIMIT_CONFIGURATION,
            action: PolicyAction.UPDATE,
            targetId: saved._id.toString(),
          },
          session,
        );
        return this.response(subject.organizationId, {
          limit: saved.limit,
          version: saved.version,
        });
      });
    } catch (error) {
      const failure =
        (error as { code?: number })?.code === 11000
          ? new ConflictException('Session limit version conflict')
          : error;
      await this.audit.record(
        AuditEvent.SESSION_LIMIT_CONFIGURATION,
        this.audit.result(failure),
        'service',
        subject,
        { resource: PolicyResource.SESSION_LIMIT_CONFIGURATION, action: PolicyAction.UPDATE },
      );
      throw failure;
    }
  }
}
