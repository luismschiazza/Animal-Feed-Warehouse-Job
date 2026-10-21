import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { AuditContext } from '@/common/audit/audit-context.service';
import { verifyAuditIndexes } from '@/common/audit/audit-indexes';
import { AuthSession } from '../schemas/auth-session.schema';
import {
  RevocationAction,
  RevocationScope,
  SessionRevocation,
} from '../schemas/session-revocation.schema';
import { isSessionId } from '../tokens/refresh-token';

export interface RevocationActor {
  id: string;
  sessionId: string;
  organizationId?: string;
}

@Injectable()
export class SessionRevocationsService implements OnModuleInit {
  constructor(
    @InjectModel(SessionRevocation.name) private readonly records: Model<SessionRevocation>,
    private readonly context: AuditContext,
  ) {}

  async onModuleInit() {
    await verifyAuditIndexes(this.records);
  }

  private oid(value: string) {
    if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value))
      throw new UnauthorizedException('Invalid revocation context');
    return new Types.ObjectId(value);
  }
  async assertActive(session: AuthSession) {
    if (!(session.createdAt instanceof Date) || !Number.isFinite(session.createdAt.getTime()))
      throw new UnauthorizedException('Invalid session metadata');
    const alternatives: Record<string, unknown>[] = [
      {
        scope: RevocationScope.SESSION,
        targetSessionId: session.sessionId,
        targetUserId: session.userId,
      },
      {
        scope: RevocationScope.USER,
        targetUserId: session.userId,
        revokedBefore: { $gte: session.createdAt },
        excludedSessionId: { $ne: session.sessionId },
      },
    ];
    if (session.organizationId)
      alternatives.push({
        scope: RevocationScope.ORGANIZATION,
        organizationId: session.organizationId,
        revokedBefore: { $gte: session.createdAt },
      });
    if (await this.records.exists({ $or: alternatives }).read('primary').exec())
      throw new UnauthorizedException('Invalid or inactive session');
  }

  // Same predicate as assertActive, evaluated before pagination on the MongoDB server.
  activeLookup(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: 'auth_session_revocations',
          let: { sid: '$sessionId', uid: '$userId', org: '$organizationId', born: '$createdAt' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    {
                      $and: [
                        { $eq: ['$scope', RevocationScope.SESSION] },
                        { $eq: ['$targetSessionId', '$$sid'] },
                        { $eq: ['$targetUserId', '$$uid'] },
                      ],
                    },
                    {
                      $and: [
                        { $eq: ['$scope', RevocationScope.USER] },
                        { $eq: ['$targetUserId', '$$uid'] },
                        { $gte: ['$revokedBefore', '$$born'] },
                        { $ne: [{ $ifNull: ['$excludedSessionId', ''] }, '$$sid'] },
                      ],
                    },
                    {
                      $and: [
                        { $eq: ['$scope', RevocationScope.ORGANIZATION] },
                        { $ne: [{ $ifNull: ['$$org', null] }, null] },
                        { $eq: ['$organizationId', '$$org'] },
                        { $gte: ['$revokedBefore', '$$born'] },
                      ],
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: '_revocations',
        },
      },
      { $match: { '_revocations.0': { $exists: false } } },
    ];
  }

  async single(session: AuthSession, action: RevocationAction, actor?: RevocationActor) {
    if (!isSessionId(session.sessionId))
      throw new UnauthorizedException('Invalid revocation context');
    return this.append(
      {
        scope: RevocationScope.SESSION,
        action,
        targetSessionId: session.sessionId,
        targetUserId: session.userId,
        ...(session.organizationId ? { organizationId: session.organizationId } : {}),
      },
      actor,
    );
  }
  async ownAll(actor: RevocationActor, othersOnly: boolean) {
    return this.append(
      {
        scope: RevocationScope.USER,
        action: othersOnly ? RevocationAction.OTHERS : RevocationAction.ALL,
        targetUserId: this.oid(actor.id),
        revokedBefore: new Date(),
        ...(othersOnly ? { excludedSessionId: actor.sessionId } : {}),
      },
      actor,
    );
  }
  async organizationAll(actor: RevocationActor) {
    return this.append(
      {
        scope: RevocationScope.ORGANIZATION,
        action: RevocationAction.ADMIN_ALL,
        organizationId: this.oid(actor.organizationId),
        revokedBefore: new Date(),
      },
      actor,
    );
  }

  private async append(rule: Partial<SessionRevocation>, actor?: RevocationActor) {
    if (actor && !isSessionId(actor.sessionId))
      throw new UnauthorizedException('Invalid revocation context');
    const record = {
      ...rule,
      occurredAt: new Date(),
      requestId: this.context.get().requestId,
      initiator: actor ? 'user' : 'system',
      actorUserId: actor ? this.oid(actor.id) : null,
      actorSessionId: actor?.sessionId ?? null,
      actorOrganizationId: actor?.organizationId ? this.oid(actor.organizationId) : null,
    };
    try {
      // The acknowledged insert itself revokes; no audit/revocation dual-write window.
      const [saved] = await this.records.create([record], {
        writeConcern: { w: 'majority', j: true },
      });
      return {
        revocationId: saved._id.toString(),
        scope: saved.scope,
        occurredAt: saved.occurredAt,
        revokedBefore: saved.revokedBefore ?? null,
        excludesCurrent: !!saved.excludedSessionId,
      };
    } catch (error) {
      if (rule.scope !== RevocationScope.SESSION || (error as { code?: number }).code !== 11000)
        throw error;
      // Only one specific revocation is authoritative; concurrent repeats do not rewrite attribution.
      const existing = await this.records
        .findOne({
          scope: RevocationScope.SESSION,
          targetSessionId: rule.targetSessionId,
          targetUserId: rule.targetUserId,
        })
        .read('primary')
        .exec();
      if (!existing) throw error;
      return {
        revocationId: existing._id.toString(),
        scope: existing.scope,
        occurredAt: existing.occurredAt,
        revokedBefore: null,
        excludesCurrent: false,
      };
    }
  }
}
