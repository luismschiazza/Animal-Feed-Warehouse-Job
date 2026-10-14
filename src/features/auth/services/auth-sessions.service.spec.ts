import { UnauthorizedException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { AuthSession, SessionRevocationReason } from '../schemas/auth-session.schema';
import { generateRefreshToken, parseRefreshToken } from '../tokens/refresh-token';
import {
  AuthSessionsService,
  MAX_SESSION_ROTATIONS,
  SESSION_TTL_MS,
} from './auth-sessions.service';

// These tests check the service contract and query structure, not MongoDB atomicity.
describe('AuthSessionsService (mocked database)', () => {
  const userId = new Types.ObjectId().toString();
  let service: AuthSessionsService;
  let db: {
    create: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };
  const query = (result: unknown) => ({ exec: jest.fn().mockResolvedValue(result) });

  beforeEach(() => {
    db = {
      create: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockReturnValue(query(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(query(null)),
      updateOne: jest.fn().mockReturnValue(query({ modifiedCount: 0 })),
    };
    service = new AuthSessionsService(db as unknown as Model<AuthSession>);
  });

  it('creates separate sessions, persists only verifiers and bounds metadata', async () => {
    const before = Date.now();
    const first = await service.create(userId, { ip: 'i'.repeat(200), userAgent: 'u'.repeat(600) });
    const second = await service.create(userId);
    expect(first.sessionId).not.toBe(second.sessionId);
    const saved = db.create.mock.calls[0][0];
    expect(saved.userId.toString()).toBe(userId);
    expect(saved.currentTokenHash).toBe(parseRefreshToken(first.refreshToken)?.tokenHash);
    expect(saved).not.toHaveProperty('refreshToken');
    expect(saved.ip).toHaveLength(128);
    expect(saved.userAgent).toHaveLength(512);
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
    expect(first).not.toHaveProperty('tokenHash');
  });

  it('persists the server-validated organization and rejects malformed identifiers', async () => {
    const organizationId = new Types.ObjectId().toString();
    await service.create(userId, {}, organizationId);
    expect(db.create.mock.calls[0][0].organizationId.toString()).toBe(organizationId);
    await expect(service.create(userId, {}, 'invalid')).rejects.toThrow(UnauthorizedException);
    expect(db.create).toHaveBeenCalledTimes(1);
  });

  it('returns no credential when persistence fails', async () => {
    db.create.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.create(userId)).rejects.toThrow('Database unavailable');
  });

  it('rejects malformed user IDs and tokens without database operations', async () => {
    await expect(service.create('not-an-object-id')).rejects.toThrow(UnauthorizedException);
    await expect(service.rotate('bad-token')).rejects.toThrow(UnauthorizedException);
    expect(db.create).not.toHaveBeenCalled();
    expect(db.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires an active session belonging to the user', async () => {
    const { sessionId } = generateRefreshToken();
    await expect(service.findActive(sessionId, userId)).rejects.toThrow(UnauthorizedException);
    expect(db.findOne).toHaveBeenCalledWith({
      sessionId,
      userId: new Types.ObjectId(userId),
      revokedAt: null,
      expiresAt: { $gt: expect.any(Date) },
    });
    db.findOne.mockReturnValue(query({ sessionId }));
    await expect(service.findActive(sessionId, userId)).resolves.toHaveProperty('sessionId');
  });

  it('revokes only an active session owned by the caller', async () => {
    const { sessionId } = generateRefreshToken();
    db.updateOne.mockReturnValue(query({ modifiedCount: 1 }));
    await service.revoke(sessionId, userId);
    expect(db.updateOne).toHaveBeenCalledWith(
      {
        sessionId,
        userId: new Types.ObjectId(userId),
        revokedAt: null,
        expiresAt: { $gt: expect.any(Date) },
      },
      { $set: { revokedAt: expect.any(Date), revocationReason: SessionRevocationReason.LOGOUT } },
    );
    db.updateOne.mockReturnValue(query({ modifiedCount: 0 }));
    await expect(service.revoke(generateRefreshToken().sessionId, userId)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('consumes and replaces the credential in one conditional update, without extending expiration', async () => {
    const current = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 60_000);
    db.findOneAndUpdate.mockReturnValue(
      query({ sessionId: current.sessionId, userId: new Types.ObjectId(userId), expiresAt }),
    );
    const next = await service.rotate(current.refreshToken);
    const [filter, update, options] = db.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      sessionId: current.sessionId,
      currentTokenId: current.tokenId,
      currentTokenHash: current.tokenHash,
      rotationVersion: { $lt: MAX_SESSION_ROTATIONS },
      revokedAt: null,
      expiresAt: { $gt: expect.any(Date) },
    });
    expect(update.$push.consumedTokens).toEqual({
      tokenId: current.tokenId,
      tokenHash: current.tokenHash,
      consumedAt: expect.any(Date),
    });
    expect(update.$inc).toEqual({ rotationVersion: 1 });
    expect(update.$set).not.toHaveProperty('expiresAt');
    expect(update.$set.currentTokenHash).toBe(parseRefreshToken(next.refreshToken)?.tokenHash);
    expect(options).toEqual({ new: true, runValidators: true });
    expect(next.refreshToken).not.toBe(current.refreshToken);
    expect(next.expiresAt).toEqual(expiresAt);
    expect(next.userId).toBe(userId);
    expect(db.updateOne).not.toHaveBeenCalled();
  });

  it('on CAS failure only revokes with proof of reuse or a valid credential at the rotation limit', async () => {
    const current = generateRefreshToken();
    await expect(service.rotate(current.refreshToken)).rejects.toThrow(UnauthorizedException);
    expect(db.updateOne).toHaveBeenNthCalledWith(
      1,
      {
        sessionId: current.sessionId,
        revokedAt: null,
        expiresAt: { $gt: expect.any(Date) },
        consumedTokens: { $elemMatch: { tokenId: current.tokenId, tokenHash: current.tokenHash } },
      },
      {
        $set: {
          revokedAt: expect.any(Date),
          revocationReason: SessionRevocationReason.REFRESH_REUSE,
        },
      },
    );
    expect(db.updateOne).toHaveBeenNthCalledWith(
      2,
      {
        sessionId: current.sessionId,
        currentTokenId: current.tokenId,
        currentTokenHash: current.tokenHash,
        rotationVersion: { $gte: MAX_SESSION_ROTATIONS },
        revokedAt: null,
        expiresAt: { $gt: expect.any(Date) },
      },
      {
        $set: {
          revokedAt: expect.any(Date),
          revocationReason: SessionRevocationReason.ROTATION_LIMIT,
        },
      },
    );
  });
});
