import { UnauthorizedException } from '@nestjs/common';
import { Model, Mongoose, Types } from 'mongoose';
import { AuditContext } from '@/common/audit/audit-context.service';
import { AuthSession } from '../schemas/auth-session.schema';
import {
  RevocationAction,
  RevocationScope,
  SessionRevocation,
  SessionRevocationSchema,
} from '../schemas/session-revocation.schema';
import { generateRefreshToken } from '../tokens/refresh-token';
import { SessionRevocationsService } from './session-revocations.service';

describe('Authoritative revocation/audit records — mocked persistence', () => {
  const actor = {
    id: new Types.ObjectId().toString(),
    sessionId: generateRefreshToken().sessionId,
    organizationId: new Types.ObjectId().toString(),
  };
  const session = {
    sessionId: generateRefreshToken().sessionId,
    userId: new Types.ObjectId(actor.id),
    organizationId: new Types.ObjectId(actor.organizationId),
    createdAt: new Date(),
  } as AuthSession;
  let service: SessionRevocationsService, db: Record<string, jest.Mock>;
  const query = (value: unknown) => ({
    read: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });
  beforeEach(() => {
    db = {
      init: jest.fn(),
      exists: jest.fn().mockReturnValue(query(null)),
      findOne: jest.fn().mockReturnValue(query(null)),
      create: jest
        .fn()
        .mockImplementation(async ([record]) => [{ ...record, _id: new Types.ObjectId() }]),
    };
    service = new SessionRevocationsService(
      db as unknown as Model<SessionRevocation>,
      new AuditContext(),
    );
  });
  it('checks specific/user/organization predicates and excludes the current SID only for others', async () => {
    await service.assertActive(session);
    expect(db.exists).toHaveBeenCalledWith({
      $or: [
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
        {
          scope: RevocationScope.ORGANIZATION,
          organizationId: session.organizationId,
          revokedBefore: { $gte: session.createdAt },
        },
      ],
    });
    db.exists.mockReturnValue(query({ _id: new Types.ObjectId() }));
    await expect(service.assertActive(session)).rejects.toThrow(UnauthorizedException);
  });
  it('does not apply organizational rules to personal sessions', async () => {
    await service.assertActive({ ...session, organizationId: null });
    expect(db.exists.mock.calls[0][0].$or).toHaveLength(2);
  });
  it('fails closed on malformed creation time and audit read failure', async () => {
    await expect(service.assertActive({ ...session, createdAt: undefined })).rejects.toThrow(
      UnauthorizedException,
    );
    db.exists.mockReturnValue({
      read: jest.fn().mockReturnThis(),
      exec: jest.fn().mockRejectedValue(new Error('Audit unavailable')),
    });
    await expect(service.assertActive(session)).rejects.toThrow('Audit unavailable');
  });
  it('uses one acknowledged durable insert for revocation and its audit, without credentials', async () => {
    const result = await service.single(session, RevocationAction.ADMIN_REVOKE, actor);
    const [[record], options] = db.create.mock.calls[0];
    expect(record).toMatchObject({
      scope: 'session',
      action: 'organization_revoke_session',
      initiator: 'user',
      actorUserId: new Types.ObjectId(actor.id),
      actorSessionId: actor.sessionId,
      actorOrganizationId: new Types.ObjectId(actor.organizationId),
      targetUserId: session.userId,
      targetSessionId: session.sessionId,
      occurredAt: expect.any(Date),
    });
    expect(options).toEqual({ writeConcern: { w: 'majority', j: true } });
    expect(Object.keys(record)).not.toEqual(
      expect.arrayContaining(['password', 'tokenHash', 'refreshToken']),
    );
    expect(result).not.toHaveProperty('actorSessionId');
    expect(result).not.toHaveProperty('targetUserId');
  });
  it('writes bounded bulk predicates, never an unbounded array of session IDs', async () => {
    await service.ownAll(actor, true);
    await service.organizationAll(actor);
    expect(db.create.mock.calls[0][0][0]).toMatchObject({
      scope: 'user',
      targetUserId: new Types.ObjectId(actor.id),
      excludedSessionId: actor.sessionId,
      revokedBefore: expect.any(Date),
    });
    expect(db.create.mock.calls[1][0][0]).toMatchObject({
      scope: 'organization',
      organizationId: new Types.ObjectId(actor.organizationId),
      revokedBefore: expect.any(Date),
    });
    expect(db.create.mock.calls[1][0][0]).not.toHaveProperty('targetSessionId');
  });
  it('does not claim success if persistence fails', async () => {
    db.create.mockRejectedValue(new Error('Audit write unavailable'));
    await expect(service.ownAll(actor, false)).rejects.toThrow('Audit write unavailable');
  });
  it('does not misattribute refresh proof to an authenticated human', async () => {
    await service.single(session, RevocationAction.REPLAY);
    expect(db.create.mock.calls[0][0][0]).toMatchObject({
      initiator: 'system',
      actorUserId: null,
      actorSessionId: null,
      action: 'refresh_reuse',
    });
  });
  it('deduplicates a concurrent single-session insert without rewriting attribution', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      scope: RevocationScope.SESSION,
      occurredAt: new Date(),
    };
    db.create.mockRejectedValue({ code: 11000 });
    db.findOne.mockReturnValue(query(existing));
    expect((await service.single(session, RevocationAction.REVOKE, actor)).revocationId).toBe(
      existing._id.toString(),
    );
    expect(db.findOne).toHaveBeenCalledWith({
      scope: 'session',
      targetSessionId: session.sessionId,
      targetUserId: session.userId,
    });
  });
  it('validates scope/action, initiator, target and allowed exclusion before persistence', async () => {
    const schema = SessionRevocationSchema.clone().set('autoCreate', false).set('autoIndex', false);
    const model = new Mongoose().model('RevocationSchemaValidation', schema);
    const valid = {
      scope: RevocationScope.USER,
      action: RevocationAction.OTHERS,
      initiator: 'user',
      actorUserId: actor.id,
      actorSessionId: actor.sessionId,
      targetUserId: actor.id,
      revokedBefore: new Date(),
      occurredAt: new Date(),
      excludedSessionId: actor.sessionId,
    };
    await expect(new model(valid).validate()).resolves.toBeUndefined();
    for (const mutation of [
      { action: RevocationAction.ADMIN_ALL },
      { actorUserId: null },
      { targetUserId: null },
      { targetUserId: new Types.ObjectId() },
      { excludedSessionId: generateRefreshToken().sessionId },
      { revokedBefore: null },
    ]) {
      await expect(new model({ ...valid, ...mutation }).validate()).rejects.toThrow();
    }
  });

  it('declares no audit TTL and a unique partial index for individual revocations', () => {
    expect(
      SessionRevocationSchema.indexes().some(
        ([, options]) => options.expireAfterSeconds !== undefined,
      ),
    ).toBe(false);
    expect(SessionRevocationSchema.indexes()).toContainEqual([
      { targetSessionId: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { scope: 'session' } }),
    ]);
  });
});
