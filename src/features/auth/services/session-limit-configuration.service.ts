import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditContext } from '@/common/audit/audit-context.service';
import { verifyAuditIndexes } from '@/common/audit/audit-indexes';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import {
  DEFAULT_ORGANIZATION_SESSION_LIMIT,
  MAX_ORGANIZATION_SESSION_LIMIT,
  MAX_SESSION_LIMIT_VERSION,
  SESSION_LIMIT_APPLICATION,
  SessionLimitRevision,
} from '../schemas/session-limit-revision.schema';
import { SessionManagementService } from './session-management.service';

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
  ) {}
  async onModuleInit() {
    await verifyAuditIndexes(this.revisions);
  }

  private async current(organizationId: string) {
    const row = await this.revisions
      .findOne({
        applicationId: SESSION_LIMIT_APPLICATION,
        organizationId: new Types.ObjectId(organizationId),
      })
      .sort({ version: -1 })
      .read('primary')
      .readConcern('majority')
      .lean()
      .exec();
    if (!row) return { limit: DEFAULT_ORGANIZATION_SESSION_LIMIT, version: 0 };
    if (
      !Number.isInteger(row.limit) ||
      row.limit < 1 ||
      row.limit > MAX_ORGANIZATION_SESSION_LIMIT ||
      !Number.isInteger(row.version) ||
      row.version < 1 ||
      row.version > MAX_SESSION_LIMIT_VERSION
    )
      throw new ServiceUnavailableException('Session limit configuration unavailable');
    return { limit: row.limit, version: row.version };
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
      const current = await this.current(subject.organizationId);
      if (current.version !== input.expectedVersion)
        throw new ConflictException('Session limit version conflict');
      // Concurrent writers of the same successor version compete on a unique index.
      // No shared memory cache, no session counter, no eviction or admission here.
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
            occurredAt: new Date(),
          },
        ],
        { writeConcern: { w: 'majority', j: true } },
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
      );
      return this.response(subject.organizationId, { limit: saved.limit, version: saved.version });
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
