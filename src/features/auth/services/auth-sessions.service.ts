import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { AuditActor, SecurityAuditService } from '@/common/audit/security-audit.service';
import { SessionPage } from '../interfaces/session-summary.interface';
import { AuthSession, SessionRevocationReason } from '../schemas/auth-session.schema';
import { SessionLimitRevision } from '../schemas/session-limit-revision.schema';
import { RevocationAction } from '../schemas/session-revocation.schema';
import { generateRefreshToken, isSessionId, parseRefreshToken } from '../tokens/refresh-token';
import { readOrganizationSessionLimit } from './session-limit-reader';
import { SessionRevocationsService } from './session-revocations.service';
import { SessionSerializationService } from './session-serialization.service';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SESSION_ROTATIONS = 1000;
export interface SessionMetadata {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthSessionsService {
  constructor(
    @InjectModel(AuthSession.name) private readonly sessions: Model<AuthSession>,
    private readonly revocations: SessionRevocationsService,
    private readonly serialization: SessionSerializationService,
    @InjectModel(SessionLimitRevision.name) private readonly revisions: Model<SessionLimitRevision>,
    private readonly audit: SecurityAuditService,
  ) {}

  async create(
    userId: string,
    metadata: SessionMetadata = {},
    organizationId?: string,
    verifiedActor?: AuditActor,
  ) {
    if (
      !/^[a-f0-9]{24}$/i.test(userId) ||
      (organizationId !== undefined && !/^[a-f0-9]{24}$/i.test(organizationId)) ||
      (verifiedActor &&
        (verifiedActor.id !== userId || verifiedActor.organizationId !== organizationId))
    )
      throw this.invalidSession();
    const credential = generateRefreshToken();
    // Stable credentials across transaction retries; nothing is returned before commit.
    const saved = await this.serialization.run(async (session, now, sequence) => {
      const scope = {
        userId: new Types.ObjectId(userId),
        organizationId: organizationId === undefined ? null : new Types.ObjectId(organizationId),
      };
      const policy =
        organizationId === undefined
          ? undefined
          : await readOrganizationSessionLimit(this.revisions, organizationId, session);
      if (policy) {
        const rows = await this.sessions
          .aggregate<{ total: number }>([
            { $match: { ...scope, revokedAt: null, expiresAt: { $gt: now } } },
            ...this.revocations.activeLookup(),
            { $count: 'total' },
          ])
          .session(session)
          .exec();
        if ((rows[0]?.total ?? 0) >= policy.limit)
          throw new ConflictException('Session limit reached');
      }
      const [created] = await this.sessions.create(
        [
          {
            ...scope,
            sessionId: credential.sessionId,
            currentTokenId: credential.tokenId,
            currentTokenHash: credential.tokenHash,
            lastUsedAt: now,
            createdAt: now,
            expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
            admissionVersion: policy?.version,
            admissionSequence: sequence,
            ip: metadata.ip?.slice(0, 128),
            userAgent: metadata.userAgent?.slice(0, 512),
          },
        ],
        { session },
      );
      await this.audit.record(
        AuditEvent.SESSION_ADMISSION,
        'allowed',
        'service',
        verifiedActor ? { ...verifiedActor, sessionId: credential.sessionId } : undefined,
        undefined,
        session,
      );
      return created;
    });
    await this.revocations.assertActive(saved);
    return {
      sessionId: credential.sessionId,
      refreshToken: credential.refreshToken,
      expiresAt: saved.expiresAt,
    };
  }

  async findActive(sessionId: string, userId: string) {
    if (!isSessionId(sessionId) || !/^[a-f0-9]{24}$/i.test(userId)) throw this.invalidSession();
    await this.serialization.assertClock();
    const session = await this.sessions
      .findOne({ sessionId, userId: new Types.ObjectId(userId), ...this.activeFilter() })
      .exec();
    if (!session) throw this.invalidSession();
    await this.revocations.assertActive(session);
    return session;
  }

  // Internal scoped readers. Management revalidates the authenticated actor before calling.
  async findTarget(sessionId: string, scope: { userId?: string; organizationId?: string }) {
    if (!isSessionId(sessionId)) throw new NotFoundException('Session not found');
    const filter = this.scopeFilter(scope);
    await this.serialization.assertClock();
    const session = await this.sessions
      .findOne({ sessionId, ...filter, ...this.activeFilter() })
      .select('sessionId userId organizationId createdAt expiresAt admissionSequence')
      .exec();
    if (!session) throw new NotFoundException('Session not found');
    try {
      await this.revocations.assertActive(session);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw new NotFoundException('Session not found');
      throw error;
    }
    return session;
  }
  listOwnedActive(
    userId: string,
    currentSessionId: string,
    limit = 25,
    before?: string,
  ): Promise<SessionPage> {
    return this.listActive({ userId }, currentSessionId, limit, before);
  }
  listOrganizationActive(
    organizationId: string,
    currentSessionId: string,
    limit = 25,
    before?: string,
  ): Promise<SessionPage> {
    return this.listActive({ organizationId }, currentSessionId, limit, before);
  }
  private scopeFilter(scope: { userId?: string; organizationId?: string }) {
    const keys = Object.keys(scope);
    if (
      keys.length !== 1 ||
      !['userId', 'organizationId'].includes(keys[0]) ||
      typeof scope[keys[0]] !== 'string' ||
      !/^[a-f0-9]{24}$/i.test(scope[keys[0]])
    )
      throw this.invalidSession();
    return { [keys[0]]: new Types.ObjectId(scope[keys[0]]) };
  }
  private async listActive(
    scope: { userId?: string; organizationId?: string },
    currentSessionId: string,
    limit: number,
    before?: string,
  ): Promise<SessionPage> {
    const filter = this.scopeFilter(scope);
    if (!isSessionId(currentSessionId)) throw this.invalidSession();
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (before !== undefined && (typeof before !== 'string' || !/^[a-f0-9]{24}$/i.test(before)))
    )
      throw new BadRequestException('Invalid session pagination');
    await this.serialization.assertClock();
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...filter,
          ...this.activeFilter(),
          createdAt: { $type: 'date' },
          ...(before ? { _id: { $lt: new Types.ObjectId(before) } } : {}),
        },
      },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 1,
          userId: 1,
          sessionId: 1,
          organizationId: 1,
          userAgent: 1,
          ip: 1,
          createdAt: 1,
          lastUsedAt: 1,
          expiresAt: 1,
          admissionSequence: 1,
        },
      },
      ...this.revocations.activeLookup(),
      { $limit: limit + 1 },
    ];
    const rows = await this.sessions
      .aggregate<AuthSession & { _id: Types.ObjectId }>(pipeline)
      .read('primary')
      .exec();
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        sessionId: row.sessionId,
        ...(scope.organizationId ? { userId: row.userId.toString() } : {}),
        organizationId: row.organizationId?.toString() ?? null,
        current: row.sessionId === currentSessionId,
        userAgent: row.userAgent,
        ip: row.ip,
        createdAt: row.createdAt,
        lastRefreshedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
      })),
      nextCursor: rows.length > limit ? page[page.length - 1]._id.toString() : null,
    };
  }

  async revoke(sessionId: string, userId: string) {
    const session = await this.findActive(sessionId, userId);
    await this.revocations.single(session, RevocationAction.LOGOUT, {
      id: userId,
      sessionId,
      ...(session.organizationId ? { organizationId: session.organizationId.toString() } : {}),
    });
  }

  async rotate(refreshToken: string) {
    const presented = parseRefreshToken(refreshToken);
    if (!presented) throw this.invalidSession();
    await this.serialization.assertClock();
    const snapshot = await this.sessions
      .findOne({ sessionId: presented.sessionId, ...this.activeFilter() })
      .exec();
    if (!snapshot) throw this.invalidSession();
    await this.revocations.assertActive(snapshot);
    const next = generateRefreshToken(presented.sessionId);
    const now = new Date();
    // Consume/replace remain a single-document CAS; revocation rules are checked again afterwards.
    const rotated = await this.sessions
      .findOneAndUpdate(
        {
          sessionId: presented.sessionId,
          currentTokenId: presented.tokenId,
          currentTokenHash: presented.tokenHash,
          rotationVersion: { $lt: MAX_SESSION_ROTATIONS },
          ...this.activeFilter(),
        },
        {
          $set: { currentTokenId: next.tokenId, currentTokenHash: next.tokenHash, lastUsedAt: now },
          $inc: { rotationVersion: 1 },
          $push: {
            consumedTokens: {
              tokenId: presented.tokenId,
              tokenHash: presented.tokenHash,
              consumedAt: now,
            },
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (rotated) {
      await this.revocations.assertActive(rotated);
      return {
        sessionId: rotated.sessionId,
        userId: rotated.userId.toString(),
        refreshToken: next.refreshToken,
        expiresAt: rotated.expiresAt,
      };
    }
    // A failed CAS alone is not proof. Load only a matching consumed/current verifier.
    const replayFilter = {
      sessionId: presented.sessionId,
      ...this.activeFilter(),
      consumedTokens: {
        $elemMatch: { tokenId: presented.tokenId, tokenHash: presented.tokenHash },
      },
    };
    const replay = await this.sessions.findOne(replayFilter).exec();
    if (replay) {
      await this.revocations.single(replay, RevocationAction.REPLAY);
      await this.sessions
        .updateOne(replayFilter, {
          $set: { revokedAt: new Date(), revocationReason: SessionRevocationReason.REFRESH_REUSE },
        })
        .exec();
    } else {
      const limitFilter = {
        sessionId: presented.sessionId,
        currentTokenId: presented.tokenId,
        currentTokenHash: presented.tokenHash,
        rotationVersion: { $gte: MAX_SESSION_ROTATIONS },
        ...this.activeFilter(),
      };
      const limited = await this.sessions.findOne(limitFilter).exec();
      if (limited) {
        await this.revocations.single(limited, RevocationAction.LIMIT);
        await this.sessions
          .updateOne(limitFilter, {
            $set: {
              revokedAt: new Date(),
              revocationReason: SessionRevocationReason.ROTATION_LIMIT,
            },
          })
          .exec();
      }
    }
    throw this.invalidSession();
  }
  private activeFilter() {
    return { revokedAt: null, $expr: { $gt: ['$expiresAt', '$$NOW'] } };
  }
  private invalidSession() {
    return new UnauthorizedException('Invalid or inactive session');
  }
}
