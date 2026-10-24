import { UnauthorizedException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { AuthSession } from '../schemas/auth-session.schema';
import { RevocationAction } from '../schemas/session-revocation.schema';
import { generateRefreshToken, parseRefreshToken } from '../tokens/refresh-token';
import {
  AuthSessionsService,
  MAX_SESSION_ROTATIONS,
  SESSION_TTL_MS,
} from './auth-sessions.service';
import { SessionRevocationsService } from './session-revocations.service';
import { SessionSerializationService } from './session-serialization.service';

describe('AuthSessionsService — mocked query/CAS contracts', () => {
  const userId = new Types.ObjectId().toString();
  let service: AuthSessionsService;
  let db: Record<string, jest.Mock>;
  let rules: { assertActive: jest.Mock; single: jest.Mock; activeLookup: jest.Mock };
  const query = (result: unknown) => ({ exec: jest.fn().mockResolvedValue(result) });
  const snapshot = (sessionId: string) => ({
    sessionId,
    userId: new Types.ObjectId(userId),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  beforeEach(() => {
    db = {
      create: jest.fn().mockImplementation(async (rows) => {
        db.findOne.mockReturnValue(query(rows[0]));
        return rows;
      }),
      aggregate: jest.fn().mockReturnValue({ session: () => ({ exec: async () => [] }) }),
      findOne: jest.fn().mockReturnValue(query(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(query(null)),
      updateOne: jest.fn().mockReturnValue(query({ modifiedCount: 1 })),
    };
    rules = {
      assertActive: jest.fn().mockResolvedValue(undefined),
      single: jest.fn().mockResolvedValue({}),
      activeLookup: jest.fn().mockReturnValue([]),
    };
    service = new AuthSessionsService(
      db as unknown as Model<AuthSession>,
      rules as unknown as SessionRevocationsService,
      {
        run: (work) => work(undefined, new Date(), 1),
        readSessions: async (pipeline) => {
          const row = await db.findOne(pipeline[0].$match).exec();
          return row ? [row] : [];
        },
      } as unknown as SessionSerializationService,
      {
        findOne: () => {
          const q = {
            sort: () => q,
            read: () => q,
            session: () => q,
            readConcern: () => q,
            lean: () => q,
            exec: async () => null,
          };
          return q;
        },
      } as any,
      { record: jest.fn() } as any,
    );
  });
  it('creates independent bounded sessions with only refresh verifiers', async () => {
    const before = Date.now();
    const first = await service.create(userId, { ip: 'i'.repeat(200), userAgent: 'u'.repeat(600) });
    const second = await service.create(userId);
    expect(first.sessionId).not.toBe(second.sessionId);
    const saved = db.create.mock.calls[0][0][0];
    expect(saved.userId.toString()).toBe(userId);
    expect(saved.currentTokenHash).toBe(parseRefreshToken(first.refreshToken).tokenHash);
    expect(saved).not.toHaveProperty('refreshToken');
    expect(saved.ip).toHaveLength(128);
    expect(saved.userAgent).toHaveLength(512);
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
    expect(first).not.toHaveProperty('tokenHash');
    expect(rules.assertActive).toHaveBeenCalledTimes(2);
  });
  it('persists organization as BSON and rejects malformed identifiers', async () => {
    const organizationId = new Types.ObjectId().toString();
    await service.create(userId, {}, organizationId);
    expect(db.create.mock.calls[0][0][0].organizationId.toString()).toBe(organizationId);
    expect(db.aggregate.mock.calls[0][0]).toEqual(
      expect.arrayContaining([{ $limit: 3 }, { $count: 'total' }]),
    );
    await expect(service.create(userId, {}, 'invalid')).rejects.toThrow(UnauthorizedException);
    await expect(service.create('invalid')).rejects.toThrow(UnauthorizedException);
    expect(db.create).toHaveBeenCalledTimes(1);
  });
  it('returns no credentials on persistence or audit-read failure', async () => {
    db.create.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(service.create(userId)).rejects.toThrow('Database unavailable');
    rules.assertActive.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.create(userId)).rejects.toThrow('Audit unavailable');
  });
  it('requires owner, unexpired/nonrevoked row and authoritative rules', async () => {
    const sid = generateRefreshToken().sessionId;
    await expect(service.findActive(sid, userId)).rejects.toThrow(UnauthorizedException);
    expect(db.findOne).toHaveBeenCalledWith({
      sessionId: sid,
      userId: new Types.ObjectId(userId),
      revokedAt: null,
      $expr: { $gt: ['$expiresAt', '$$NOW'] },
    });
    db.findOne.mockReturnValue(query(snapshot(sid)));
    await service.findActive(sid, userId);
    expect(rules.assertActive).toHaveBeenCalled();
    rules.assertActive.mockRejectedValue(new UnauthorizedException());
    await expect(service.findActive(sid, userId)).rejects.toThrow(UnauthorizedException);
  });
  it('logout writes an authoritative audit instead of a non-atomic two-collection revoke', async () => {
    const sid = generateRefreshToken().sessionId,
      row = snapshot(sid);
    db.findOne.mockReturnValue(query(row));
    await service.revoke(sid, userId);
    expect(rules.single).toHaveBeenCalledWith(row, RevocationAction.LOGOUT, {
      id: userId,
      sessionId: sid,
    });
    expect(db.updateOne).not.toHaveBeenCalled();
    rules.single.mockRejectedValue(new Error('Audit write failed'));
    await expect(service.revoke(sid, userId)).rejects.toThrow('Audit write failed');
    expect(db.updateOne).not.toHaveBeenCalled();
  });
  it('keeps consume/replace atomic and never extends absolute expiration', async () => {
    const current = generateRefreshToken(),
      row = snapshot(current.sessionId);
    db.findOne.mockReturnValue(query(row));
    db.findOneAndUpdate.mockReturnValue(query(row));
    const next = await service.rotate(current.refreshToken);
    const [filter, update, options] = db.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      sessionId: current.sessionId,
      currentTokenId: current.tokenId,
      currentTokenHash: current.tokenHash,
      rotationVersion: { $lt: MAX_SESSION_ROTATIONS },
      revokedAt: null,
      $expr: { $gt: ['$expiresAt', '$$NOW'] },
    });
    expect(update.$push.consumedTokens).toEqual({
      tokenId: current.tokenId,
      tokenHash: current.tokenHash,
      consumedAt: expect.any(Date),
    });
    expect(update.$set).not.toHaveProperty('expiresAt');
    expect(update.$set.currentTokenHash).toBe(parseRefreshToken(next.refreshToken).tokenHash);
    expect(update.$inc).toEqual({ rotationVersion: 1 });
    expect(options).toEqual({ new: true, runValidators: true });
    expect(next.expiresAt).toEqual(row.expiresAt);
    expect(rules.assertActive).toHaveBeenCalledTimes(2);
  });
  it('does not revoke on an incorrect secret or a failed CAS alone', async () => {
    const current = generateRefreshToken();
    db.findOne.mockReturnValueOnce(query(snapshot(current.sessionId)));
    await expect(service.rotate(current.refreshToken)).rejects.toThrow(UnauthorizedException);
    expect(rules.single).not.toHaveBeenCalled();
    expect(db.updateOne).not.toHaveBeenCalled();
  });
  it.each([
    [RevocationAction.REPLAY, 'refresh_reuse'],
    [RevocationAction.LIMIT, 'rotation_limit'],
  ])('audits %s before updating the optional physical cache', async (action, reason) => {
    const current = generateRefreshToken(),
      row = snapshot(current.sessionId);
    db.findOne.mockReturnValueOnce(query(row));
    if (action === RevocationAction.LIMIT) db.findOne.mockReturnValueOnce(query(null));
    db.findOne.mockReturnValueOnce(query(row));
    await expect(service.rotate(current.refreshToken)).rejects.toThrow(UnauthorizedException);
    expect(rules.single).toHaveBeenCalledWith(row, action);
    expect(db.updateOne).toHaveBeenCalledWith(expect.any(Object), {
      $set: { revokedAt: expect.any(Date), revocationReason: reason },
    });
    expect(rules.single.mock.invocationCallOrder[0]).toBeLessThan(
      db.updateOne.mock.invocationCallOrder[0],
    );
  });
  it('rejects malformed refresh without querying', async () => {
    await expect(service.rotate('bad-token')).rejects.toThrow(UnauthorizedException);
    expect(db.findOne).not.toHaveBeenCalled();
    expect(db.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
