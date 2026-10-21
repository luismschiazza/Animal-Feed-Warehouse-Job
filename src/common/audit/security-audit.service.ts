import {
  BadRequestException,
  HttpException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { isSessionId } from '@/features/auth/tokens/refresh-token';
import { PolicyAction, PolicyResource } from '../authorization/policy.types';
import { Role } from '../enums/role.enum';
import { AuditContext } from './audit-context.service';
import { verifyAuditIndexes } from './audit-indexes';
import { AuditEvent, AuditPhase, AuditResult, SecurityAuditRecord } from './security-audit.schema';

export type AuditActor = {
  id: string;
  sessionId?: string;
  organizationId?: string;
  roles?: Role[];
  membershipId?: string;
};
export type AuditScope = { kind: 'user' | 'organization'; id: string } | { kind: 'anonymous' };
const oid = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) ? new Types.ObjectId(value) : null;
const identifier = (value: unknown) =>
  oid(value) || isSessionId(value) ? String(value) : undefined;

@Injectable()
export class SecurityAuditService implements OnModuleInit {
  constructor(
    @InjectModel(SecurityAuditRecord.name) private readonly records: Model<SecurityAuditRecord>,
    private readonly context: AuditContext,
  ) {}
  async onModuleInit() {
    await verifyAuditIndexes(this.records);
  }

  async record(
    event: AuditEvent,
    result: AuditResult,
    phase: AuditPhase,
    actor?: AuditActor,
    policy?: { resource?: string; action?: string; targetId?: string },
  ) {
    // Construct a NEW allowlisted object: never spread requests, errors, DTOs or tokens.
    const row = {
      event,
      result,
      phase,
      occurredAt: new Date(),
      ...this.context.get(),
      actorUserId: oid(actor?.id),
      membershipId: oid(actor?.membershipId),
      roles: [
        ...new Set(
          (Array.isArray(actor?.roles) ? actor.roles : []).filter((role) =>
            Object.values(Role).includes(role),
          ),
        ),
      ],
      organizationId: oid(actor?.organizationId),
      sessionId: isSessionId(actor?.sessionId) ? actor.sessionId : null,
      resource: Object.values(PolicyResource).includes(policy?.resource as PolicyResource)
        ? policy.resource
        : undefined,
      action: Object.values(PolicyAction).includes(policy?.action as PolicyAction)
        ? policy.action
        : undefined,
      // Own-session targets may belong to another tenant; do not expose their SID in this actor's tenant stream.
      targetId:
        policy?.resource === PolicyResource.SESSION ? undefined : identifier(policy?.targetId),
      reason: result === 'allowed' ? 'accepted' : result === 'denied' ? 'rejected' : 'unavailable',
    };
    try {
      await this.records.create([row], { writeConcern: { w: 'majority', j: true } });
    } catch {
      throw new ServiceUnavailableException('Security audit unavailable');
    }
  }
  result(error: unknown): AuditResult {
    return error instanceof HttpException && error.getStatus() < 500 ? 'denied' : 'error';
  }

  // Internal reader. Public callers must use AuditQueryService's live authorization.
  // Each source is tenant/owner-filtered BEFORE union, projection, ordering and pagination.
  async page(scope: AuditScope, limit = 25, before?: string) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('Invalid audit pagination');
    if (!scope || !['user', 'organization', 'anonymous'].includes(scope.kind))
      throw new BadRequestException('Invalid audit scope');
    if (before !== undefined && typeof before !== 'string')
      throw new BadRequestException('Invalid audit cursor');
    const cursor = before?.match(/^([a-f0-9]{24})\.(security|revocation)$/);
    if (before !== undefined && !cursor) throw new BadRequestException('Invalid audit cursor');
    if (scope.kind !== 'anonymous' && !oid(scope.id))
      throw new BadRequestException('Invalid audit scope');
    const id = scope.kind === 'anonymous' ? null : oid(scope.id);
    const securityFilter =
      scope.kind === 'organization'
        ? { organizationId: id }
        : scope.kind === 'user'
          ? { actorUserId: id }
          : { actorUserId: null, organizationId: null };
    const revocationFilter =
      scope.kind === 'organization'
        ? {
            // Global user-wide rules affect multiple contexts; only their acting tenant sees metadata.
            $or: [
              { scope: { $in: ['session', 'organization'] }, organizationId: id },
              { scope: 'user', actorOrganizationId: id },
            ],
          }
        : scope.kind === 'user'
          ? { $or: [{ actorUserId: id }, { targetUserId: id }] }
          : { _id: { $exists: false } };
    const boundary = (source: string) =>
      !cursor
        ? {}
        : {
            $or: [
              { _id: { $lt: new Types.ObjectId(cursor[1]) } },
              ...(source < cursor[2] ? [{ _id: new Types.ObjectId(cursor[1]) }] : []),
            ],
          };
    const pipeline: PipelineStage[] = [
      { $match: { $and: [securityFilter, boundary('security')] } },
      { $sort: { _id: -1 } },
      { $limit: limit + 1 },
      {
        $project: {
          _id: 1,
          source: { $literal: 'security' },
          event: 1,
          result: 1,
          phase: 1,
          occurredAt: 1,
          requestId: 1,
          actorUserId: 1,
          roles: 1,
          membershipId: 1,
          organizationId: 1,
          sessionId: 1,
          resource: 1,
          action: 1,
          targetId: 1,
          reason: 1,
          method: 1,
          ip: 1,
        },
      },
      {
        $unionWith: {
          coll: 'auth_session_revocations',
          pipeline: [
            { $match: { $and: [revocationFilter, boundary('revocation')] } },
            { $sort: { _id: -1 } },
            { $limit: limit + 1 },
            {
              $project: {
                _id: 1,
                source: { $literal: 'revocation' },
                event: { $literal: 'revocation' },
                result: { $literal: 'effective' },
                phase: { $literal: 'authoritative' },
                occurredAt: 1,
                requestId: 1,
                actorUserId: 1,
                organizationId: 1,
                actorOrganizationId: 1,
                sessionId:
                  scope.kind === 'organization'
                    ? { $cond: [{ $eq: ['$actorOrganizationId', id] }, '$actorSessionId', null] }
                    : '$actorSessionId',
                action: 1,
                scope: 1,
                initiator: 1,
                targetUserId: 1,
                targetSessionId: 1,
                revokedBefore: 1,
                excludedSessionId: 1,
                ...(scope.kind === 'organization'
                  ? {
                      actorOrganizationId: {
                        $cond: [
                          { $eq: ['$actorOrganizationId', id] },
                          '$actorOrganizationId',
                          null,
                        ],
                      },
                    }
                  : {}),
              },
            },
          ],
        },
      },
      { $sort: { _id: -1, source: -1 } },
      { $limit: limit + 1 },
    ];
    try {
      const rows = await this.records.aggregate(pipeline).read('primary').exec();
      const selected = rows.slice(0, limit);
      const fields = [
        'source',
        'event',
        'result',
        'phase',
        'occurredAt',
        'requestId',
        'actorUserId',
        'roles',
        'membershipId',
        'organizationId',
        'actorOrganizationId',
        'sessionId',
        'resource',
        'action',
        'targetId',
        'reason',
        'method',
        'ip',
        'scope',
        'initiator',
        'targetUserId',
        'targetSessionId',
        'revokedBefore',
        'excludedSessionId',
      ];
      return {
        items: selected.map((row) => ({
          eventId: row._id.toString(),
          source: row.source as 'security' | 'revocation',
          ...Object.fromEntries(
            fields.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
          ),
        })),
        nextCursor:
          rows.length > limit
            ? `${selected[selected.length - 1]._id.toString()}.${selected[selected.length - 1].source}`
            : null,
      };
    } catch {
      throw new ServiceUnavailableException('Security audit unavailable');
    }
  }
}
