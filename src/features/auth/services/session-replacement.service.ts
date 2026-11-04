import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, PipelineStage, Types } from 'mongoose';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { AuditActor, SecurityAuditService } from '@/common/audit/security-audit.service';
import { AuthSession } from '../schemas/auth-session.schema';
import {
  SESSION_LIMIT_APPLICATION,
  SessionLimitRevision,
} from '../schemas/session-limit-revision.schema';
import {
  SessionReplacement,
  verifyReplacementIndexes,
} from '../schemas/session-replacement.schema';
import { RevocationAction } from '../schemas/session-revocation.schema';
import { generateRefreshToken, isSessionId } from '../tokens/refresh-token';
import {
  MAX_REPLACEMENT_RECOVERIES,
  isRecoveryChallenge,
  recoveryChallenge,
} from '../tokens/session-replacement-recovery';
import {
  REPLACEMENT_TTL_MS,
  generateReplacementToken,
  parseReplacementToken,
} from '../tokens/session-replacement-token';
import { SESSION_TTL_MS, SessionMetadata } from './auth-sessions.service';
import { AuthService, AuthenticatedUser } from './auth.service';
import { readOrganizationSessionLimit } from './session-limit-reader';
import { SessionRevocationsService } from './session-revocations.service';
import { SessionSerializationService } from './session-serialization.service';

@Injectable()
export class SessionReplacementService {
  constructor(
    @InjectModel(SessionReplacement.name) private readonly tickets: Model<SessionReplacement>,
    @InjectModel(AuthSession.name) private readonly sessions: Model<AuthSession>,
    @InjectModel(SessionLimitRevision.name) private readonly revisions: Model<SessionLimitRevision>,
    private readonly serialization: SessionSerializationService,
    private readonly revocations: SessionRevocationsService,
    private readonly auth: AuthService,
    private readonly audit: SecurityAuditService,
  ) {}

  private invalid() {
    return new UnauthorizedException('Invalid or inactive replacement authorization');
  }
  private async ready() {
    try {
      await verifyReplacementIndexes(this.tickets);
    } catch {
      throw new ServiceUnavailableException('Session replacement unavailable');
    }
  }
  // Pre-filter garbage/unknown/expired credentials BEFORE the global mutation queue.
  // This is NOT authorization: pending() repeats all checks in the fenced snapshot.
  private async preflight(token: unknown) {
    const parsed = parseReplacementToken(token);
    if (!parsed) throw this.invalid();
    await this.ready();
    let exists: unknown;
    try {
      exists = await this.tickets
        .exists({
          _id: parsed.id,
          secretHash: parsed.secretHash,
          applicationId: SESSION_LIMIT_APPLICATION,
          state: 'pending',
          $expr: { $and: [{ $gt: ['$expiresAt', '$$NOW'] }, { $lte: ['$createdAt', '$$NOW'] }] },
        })
        .read('primary')
        .setOptions({ maxTimeMS: 5_000, timeoutMS: 10_000 })
        .exec();
    } catch {
      throw new ServiceUnavailableException('Session replacement unavailable');
    }
    if (!exists) throw this.invalid();
  }

  private scope(ticket: Pick<SessionReplacement, 'userId' | 'organizationId'>) {
    return { userId: ticket.userId, organizationId: ticket.organizationId };
  }
  private eligible(
    scope: { userId: Types.ObjectId; organizationId: Types.ObjectId },
    now: Date,
  ): PipelineStage[] {
    return [
      { $match: { ...scope, revokedAt: null, expiresAt: { $gt: now } } },
      ...this.revocations.activeLookup(),
    ];
  }
  private async count(
    scope: { userId: Types.ObjectId; organizationId: Types.ObjectId },
    now: Date,
    cap: number,
    session: ClientSession,
  ) {
    const rows = await this.sessions
      .aggregate<{ total: number }>([
        ...this.eligible(scope, now),
        { $limit: cap },
        { $count: 'total' },
      ])
      .session(session)
      .exec();
    return rows[0]?.total ?? 0;
  }
  private async pending(token: unknown, now: Date, session: ClientSession) {
    const parsed = parseReplacementToken(token);
    if (!parsed) throw this.invalid();
    const ticket = await this.tickets
      .findOne({
        _id: parsed.id,
        secretHash: parsed.secretHash,
        applicationId: SESSION_LIMIT_APPLICATION,
        state: 'pending',
        expiresAt: { $gt: now },
        createdAt: { $lte: now },
      })
      .select('+passwordProof')
      .session(session)
      .lean()
      .exec();
    if (
      !ticket ||
      !(ticket.expiresAt instanceof Date) ||
      !(ticket.createdAt instanceof Date) ||
      ticket.expiresAt.getTime() - ticket.createdAt.getTime() !== REPLACEMENT_TTL_MS
    )
      throw this.invalid();
    const identity = await this.auth.requireReplacementIdentity(
      ticket.userId.toString(),
      ticket.organizationId.toString(),
      ticket.passwordProof,
      ticket.membershipId.toString(),
      session,
    );
    return { ticket, identity: { ...identity, replacementFlowId: ticket._id }, parsed };
  }

  async start(
    user: AuthenticatedUser,
    organizationId?: string,
    metadata: SessionMetadata = {},
    challenge?: string,
  ) {
    let actor: AuditActor;
    try {
      const proof = this.auth.replacementLoginProof(user);
      if (challenge !== undefined && !isRecoveryChallenge(challenge))
        throw new BadRequestException('Invalid recovery challenge');
      if (typeof organizationId !== 'string' || !/^[a-f0-9]{24}$/i.test(organizationId))
        throw new BadRequestException('Replacement requires an explicit organization context');
      await this.ready();
      const token = generateReplacementToken(); // stable across transaction retries
      return await this.serialization.run(async (session, now) => {
        const identity = await this.auth.requireReplacementIdentity(
          user.id,
          organizationId,
          proof,
          undefined,
          session,
        );
        actor = { ...identity, replacementFlowId: token.id };
        const scope = {
          userId: new Types.ObjectId(identity.id),
          organizationId: new Types.ObjectId(identity.organizationId),
        };
        const policy = await readOrganizationSessionLimit(this.revisions, organizationId, session);
        if ((await this.count(scope, now, policy.limit, session)) < policy.limit)
          throw new ConflictException('Session replacement is only available at the limit');
        await this.tickets
          .updateMany(
            {
              ...scope,
              applicationId: SESSION_LIMIT_APPLICATION,
              state: 'pending',
              expiresAt: { $lte: now },
            },
            { $set: { state: 'expired' } },
            { session },
          )
          .exec();
        if (
          await this.tickets
            .exists({ ...scope, applicationId: SESSION_LIMIT_APPLICATION, state: 'pending' })
            .session(session)
        )
          throw new ConflictException('A replacement flow is already pending');
        const expiresAt = new Date(now.getTime() + REPLACEMENT_TTL_MS);
        await this.tickets.create(
          [
            {
              _id: token.id,
              applicationId: SESSION_LIMIT_APPLICATION,
              ...scope,
              membershipId: new Types.ObjectId(identity.membershipId),
              secretHash: token.secretHash,
              passwordProof: proof,
              recoveryChallenge: challenge,
              recoveryVersion: 0,
              recoveryRequestIds: [],
              state: 'pending',
              createdAt: now,
              expiresAt,
              ip: metadata.ip?.slice(0, 128),
              userAgent: metadata.userAgent?.slice(0, 512),
            },
          ],
          { session },
        );
        await this.audit.record(
          AuditEvent.REPLACEMENT_START,
          'allowed',
          'service',
          actor,
          undefined,
          session,
        );
        return {
          replacement_required: true,
          replacement_token: token.token,
          expires_at: expiresAt,
          ...(challenge
            ? {
                recovery: {
                  flow_id: token.id,
                  expires_at: expiresAt,
                  protocol: 2,
                  max_recoveries: MAX_REPLACEMENT_RECOVERIES,
                },
              }
            : {}),
        };
      });
    } catch (error) {
      await this.audit.record(
        AuditEvent.REPLACEMENT_START,
        this.audit.result(error),
        'service',
        actor,
      );
      throw error;
    }
  }

  async list(token: unknown, before?: string) {
    let actor: AuditActor;
    try {
      if (before !== undefined && (typeof before !== 'string' || !/^[a-f0-9]{24}$/i.test(before)))
        throw new BadRequestException('Invalid replacement pagination');
      await this.preflight(token);
      return await this.serialization.run(async (session, now) => {
        const { ticket, identity } = await this.pending(token, now, session);
        actor = identity;
        const rows = await this.sessions
          .aggregate<{
            _id: Types.ObjectId;
            sessionId: string;
            createdAt: Date;
            lastUsedAt: Date;
            expiresAt: Date;
            userAgent?: string;
          }>([
            ...this.eligible(this.scope(ticket), now),
            { $match: { createdAt: { $type: 'date' } } },
            ...(before ? [{ $match: { _id: { $lt: new Types.ObjectId(before) } } }] : []),
            { $sort: { _id: -1 } },
            { $limit: 26 },
            {
              $project: {
                _id: 1,
                sessionId: 1,
                createdAt: 1,
                lastUsedAt: 1,
                expiresAt: 1,
                userAgent: 1,
              },
            },
          ])
          .session(session)
          .exec();
        await this.audit.record(
          AuditEvent.REPLACEMENT_LIST,
          'allowed',
          'service',
          actor,
          undefined,
          session,
        );
        return {
          items: rows.slice(0, 25).map((row) => ({
            sessionId: row.sessionId,
            createdAt: row.createdAt,
            lastUsedAt: row.lastUsedAt,
            expiresAt: row.expiresAt,
            device: typeof row.userAgent === 'string' ? row.userAgent.slice(0, 80) : null,
          })),
          nextCursor: rows.length > 25 ? rows[24]._id.toString() : null,
        };
      });
    } catch (error) {
      await this.audit.record(
        AuditEvent.REPLACEMENT_LIST,
        this.audit.result(error),
        'service',
        actor,
      );
      throw error;
    }
  }

  async cancel(token: unknown) {
    let actor: AuditActor;
    try {
      await this.preflight(token);
      return await this.serialization.run(async (session, now) => {
        const { ticket, identity, parsed } = await this.pending(token, now, session);
        actor = identity;
        const result = await this.tickets
          .updateOne(
            { _id: ticket._id, secretHash: parsed.secretHash, state: 'pending' },
            { $set: { state: 'cancelled' } },
            { session },
          )
          .exec();
        if (result.modifiedCount !== 1) throw this.invalid();
        await this.audit.record(
          AuditEvent.REPLACEMENT_CANCEL,
          'allowed',
          'service',
          actor,
          undefined,
          session,
        );
        return { cancelled: true };
      });
    } catch (error) {
      await this.audit.record(
        AuditEvent.REPLACEMENT_CANCEL,
        this.audit.result(error),
        'service',
        actor,
      );
      throw error;
    }
  }

  // A fresh password AND a private per-attempt verifier are mandatory. This is
  // controlled replacement of the latest family, never retransmission of credentials.
  // Each public operation ID is applied at most once; the private proof may authorize
  // another intent only with fresh password authentication and within the fixed budget/TTL.
  async recover(
    user: AuthenticatedUser,
    organizationId: string,
    flowId: unknown,
    verifier: unknown,
    recoveryRequestId: unknown,
    metadata: SessionMetadata = {},
  ) {
    let actor: AuditActor;
    try {
      const proof = this.auth.replacementLoginProof(user);
      const challenge = recoveryChallenge(verifier);
      if (
        !isSessionId(flowId) ||
        !isSessionId(recoveryRequestId) ||
        !challenge ||
        typeof organizationId !== 'string' ||
        !/^[a-f0-9]{24}$/i.test(organizationId)
      )
        throw this.invalid();
      await this.ready();
      const filter = {
        _id: flowId,
        applicationId: SESSION_LIMIT_APPLICATION,
        userId: new Types.ObjectId(user.id),
        organizationId: new Types.ObjectId(organizationId),
        recoveryChallenge: challenge,
        state: { $in: ['pending', 'consumed', 'recovered'] },
      };
      // Read-only rejection of garbage/replay before the global mutation queue.
      // Like preflight(), this does not authorize anything: repeat inside run().
      if (
        !(await this.tickets
          .exists({
            ...filter,
            $expr: { $and: [{ $gt: ['$expiresAt', '$$NOW'] }, { $lte: ['$createdAt', '$$NOW'] }] },
          })
          .read('primary')
          .setOptions({ maxTimeMS: 5_000, timeoutMS: 10_000 })
          .exec())
      )
        throw this.invalid();
      const credential = generateRefreshToken();
      const receipt = await this.serialization.run(async (session, now, sequence) => {
        const ticket = await this.tickets
          .findOne({
            ...filter,
            expiresAt: { $gt: now },
            createdAt: { $lte: now },
          })
          .select('+passwordProof +recoveryRequestIds')
          .session(session)
          .lean()
          .exec();
        if (
          !ticket ||
          ticket.passwordProof !== proof ||
          !(ticket.createdAt instanceof Date) ||
          !(ticket.expiresAt instanceof Date) ||
          ticket.expiresAt.getTime() - ticket.createdAt.getTime() !== REPLACEMENT_TTL_MS
        )
          throw this.invalid();
        const identity = await this.auth.requireReplacementIdentity(
          user.id,
          organizationId,
          proof,
          ticket.membershipId.toString(),
          session,
        );
        actor = {
          ...identity,
          replacementFlowId: ticket._id,
          replacementRecoveryRequestId: recoveryRequestId,
        };
        if (ticket.state === 'pending')
          throw new ConflictException({
            code: 'replacement_not_committed',
            message: 'Replacement not committed; retry within the original expiry',
          });
        const version = ticket.recoveryVersion;
        const ids = ticket.recoveryRequestIds;
        if (
          !isSessionId(ticket.admittedSessionId) ||
          !Number.isSafeInteger(version) ||
          version < 0 ||
          version > MAX_REPLACEMENT_RECOVERIES ||
          !Array.isArray(ids) ||
          ids.length !== version ||
          !ids.every(isSessionId) ||
          new Set(ids).size !== ids.length ||
          (version === 0
            ? ticket.state !== 'consumed' || !!ticket.recoveredSessionId
            : ticket.state !== 'recovered')
        )
          throw this.invalid();
        if (ids.includes(recoveryRequestId))
          throw new ConflictException({
            code: 'recovery_already_applied',
            message: 'Recovery request already applied; reauthenticate with a new request ID',
          });
        if (version >= MAX_REPLACEMENT_RECOVERIES)
          throw new ConflictException({
            code: 'recovery_budget_exhausted',
            message: 'Recovery budget exhausted; start a new explicit flow',
          });
        const targetId = version === 0 ? ticket.admittedSessionId : ticket.recoveredSessionId;
        if (!isSessionId(targetId)) throw this.invalid();
        const targets = await this.sessions
          .aggregate<AuthSession>([
            ...this.eligible(this.scope(ticket), now),
            { $match: { sessionId: targetId, createdAt: { $type: 'date' } } },
            { $limit: 1 },
            { $project: { _id: 0, sessionId: 1, userId: 1, organizationId: 1, expiresAt: 1 } },
          ])
          .session(session)
          .exec();
        if (targets.length !== 1 || !(targets[0].expiresAt instanceof Date)) throw this.invalid();
        const policy = await readOrganizationSessionLimit(this.revisions, organizationId, session);
        if ((await this.count(this.scope(ticket), now, policy.limit + 1, session)) > policy.limit)
          throw new ConflictException('Recovery cannot resolve the current session limit');
        const consumed = await this.tickets
          .updateOne(
            {
              ...filter,
              state: ticket.state,
              recoveryVersion: version,
              admittedSessionId: ticket.admittedSessionId,
              ...(version > 0 ? { recoveredSessionId: targetId } : {}),
              recoveryRequestIds: { $ne: recoveryRequestId },
            },
            {
              $set: { state: 'recovered', recoveredSessionId: credential.sessionId },
              $inc: { recoveryVersion: 1 },
              $push: { recoveryRequestIds: recoveryRequestId },
            },
            { session },
          )
          .exec();
        if (consumed.modifiedCount !== 1) throw this.invalid();
        const resultingActor = {
          ...actor,
          sessionId: credential.sessionId,
          replacementRecoveryVersion: version + 1,
        };
        await this.revocations.replaceInTransaction(
          targets[0],
          resultingActor,
          session,
          now,
          RevocationAction.RECOVER_REPLACEMENT,
        );
        if ((await this.count(this.scope(ticket), now, policy.limit, session)) >= policy.limit)
          throw new ConflictException('Session limit reached');
        await this.sessions.create(
          [
            {
              ...this.scope(ticket),
              sessionId: credential.sessionId,
              currentTokenId: credential.tokenId,
              currentTokenHash: credential.tokenHash,
              createdAt: now,
              lastUsedAt: now,
              expiresAt: targets[0].expiresAt,
              admissionVersion: policy.version,
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
          resultingActor,
          undefined,
          session,
        );
        await this.audit.record(
          AuditEvent.REPLACEMENT_RECOVER,
          'allowed',
          'service',
          resultingActor,
          undefined,
          session,
        );
        return {
          userId: identity.id,
          organizationId: identity.organizationId,
          membershipId: identity.membershipId,
          passwordProof: proof,
          recoveryVersion: version + 1,
        };
      });
      const pair = await this.auth.completeReplacement(
        receipt.userId,
        receipt.organizationId,
        receipt.membershipId,
        receipt.passwordProof,
        credential.sessionId,
        credential.refreshToken,
      );
      return {
        ...pair,
        recovery_version: receipt.recoveryVersion,
        recovery_request_id: recoveryRequestId,
      };
    } catch (error) {
      await this.audit.record(
        AuditEvent.REPLACEMENT_RECOVER,
        this.audit.result(error),
        'service',
        actor,
      );
      throw error;
    }
  }

  async confirm(token: unknown, selectedSessionId: unknown) {
    let actor: AuditActor;
    try {
      if (!isSessionId(selectedSessionId)) throw this.invalid();
      await this.preflight(token);
      const credential = generateRefreshToken(); // stable across all driver retries; never stored in clear
      const receipt = await this.serialization.run(async (session, now, sequence) => {
        const { ticket, identity, parsed } = await this.pending(token, now, session);
        actor = identity;
        const targets = await this.sessions
          .aggregate<AuthSession>([
            ...this.eligible(this.scope(ticket), now),
            { $match: { sessionId: selectedSessionId, createdAt: { $type: 'date' } } },
            { $limit: 1 },
            { $project: { _id: 0, sessionId: 1, userId: 1, organizationId: 1 } },
          ])
          .session(session)
          .exec();
        if (targets.length !== 1) throw this.invalid();
        const policy = await readOrganizationSessionLimit(
          this.revisions,
          identity.organizationId,
          session,
        );
        // One explicit removal plus one admission keeps the same count. Excess is NOT silently purged.
        if ((await this.count(this.scope(ticket), now, policy.limit + 1, session)) > policy.limit)
          throw new ConflictException(
            'One selected session cannot resolve the current session limit',
          );
        const result = await this.tickets
          .updateOne(
            { _id: ticket._id, secretHash: parsed.secretHash, state: 'pending' },
            { $set: { state: 'consumed', admittedSessionId: credential.sessionId } },
            { session },
          )
          .exec();
        if (result.modifiedCount !== 1) throw this.invalid();
        const resultingActor = { ...identity, sessionId: credential.sessionId };
        await this.audit.record(
          AuditEvent.REPLACEMENT_SELECTION,
          'allowed',
          'service',
          resultingActor,
          undefined,
          session,
        );
        await this.revocations.replaceInTransaction(targets[0], resultingActor, session, now);
        // Re-count AFTER the authoritative rule, as normal #17 admission does. No cached slot counter.
        if ((await this.count(this.scope(ticket), now, policy.limit, session)) >= policy.limit)
          throw new ConflictException('Session limit reached');
        await this.sessions.create(
          [
            {
              ...this.scope(ticket),
              sessionId: credential.sessionId,
              currentTokenId: credential.tokenId,
              currentTokenHash: credential.tokenHash,
              createdAt: now,
              lastUsedAt: now,
              expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
              admissionVersion: policy.version,
              admissionSequence: sequence,
              ip: ticket.ip,
              userAgent: ticket.userAgent,
            },
          ],
          { session },
        );
        await this.audit.record(
          AuditEvent.SESSION_ADMISSION,
          'allowed',
          'service',
          resultingActor,
          undefined,
          session,
        );
        await this.audit.record(
          AuditEvent.REPLACEMENT_CONFIRM,
          'allowed',
          'service',
          resultingActor,
          undefined,
          session,
        );
        return {
          userId: identity.id,
          organizationId: identity.organizationId,
          membershipId: identity.membershipId,
          passwordProof: ticket.passwordProof,
        };
      });
      // No token pair before confirmed commit and live clock/session/account/context revalidation.
      return await this.auth.completeReplacement(
        receipt.userId,
        receipt.organizationId,
        receipt.membershipId,
        receipt.passwordProof,
        credential.sessionId,
        credential.refreshToken,
      );
    } catch (error) {
      await this.audit.record(
        AuditEvent.REPLACEMENT_CONFIRM,
        this.audit.result(error),
        'service',
        actor,
      );
      throw error;
    }
  }
}
