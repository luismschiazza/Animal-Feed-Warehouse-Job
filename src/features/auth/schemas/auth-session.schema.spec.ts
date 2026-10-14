import { Types, model } from 'mongoose';
import { AuthSession, AuthSessionSchema } from './auth-session.schema';

const SessionModel = model<AuthSession>('AuthSessionSchemaTest', AuthSessionSchema);

function createSession() {
  return new SessionModel({
    sessionId: 'public-session-id',
    userId: new Types.ObjectId(),
    currentTokenId: 'current-token-id',
    currentTokenHash: 'a'.repeat(64),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    consumedTokens: [
      { tokenId: 'old-token-id', tokenHash: 'b'.repeat(64), consumedAt: new Date() },
    ],
  });
}

describe('AuthSession schema (without database)', () => {
  it('accepts a session with defaults and an embedded consumed verifier', () => {
    const session = createSession();

    expect(session.validateSync()).toBeUndefined();
    expect(session.rotationVersion).toBe(0);
    expect(session.revokedAt).toBeNull();
    expect(session.revocationReason).toBeNull();
    expect(session.consumedTokens[0]).not.toHaveProperty('_id');
  });

  it('requires the owner, identifiers and expiration', () => {
    const error = new SessionModel().validateSync();

    expect(error?.errors).toHaveProperty('userId');
    expect(error?.errors).toHaveProperty('sessionId');
    expect(error?.errors).toHaveProperty('currentTokenId');
    expect(error?.errors).toHaveProperty('currentTokenHash');
    expect(error?.errors).toHaveProperty('expiresAt');
  });

  it('rejects invalid verifiers and oversized device metadata', () => {
    const session = createSession();
    session.currentTokenHash = 'not-a-sha256-verifier';
    session.userAgent = 'x'.repeat(513);
    session.ip = 'x'.repeat(129);
    session.rotationVersion = -1;

    const error = session.validateSync();
    expect(error?.errors).toHaveProperty('currentTokenHash');
    expect(error?.errors).toHaveProperty('userAgent');
    expect(error?.errors).toHaveProperty('ip');
    expect(error?.errors).toHaveProperty('rotationVersion');
  });

  it('does not serialize current or consumed verifiers', () => {
    const session = createSession();

    for (const result of [session.toJSON(), session.toObject()]) {
      expect(result).not.toHaveProperty('currentTokenHash');
      expect(result).not.toHaveProperty('consumedTokens');
      expect(result).toHaveProperty('sessionId', 'public-session-id');
    }
    expect(JSON.stringify(session)).not.toContain('a'.repeat(64));
    expect(JSON.stringify(session)).not.toContain('b'.repeat(64));
  });

  it('declares uniqueness, owner lookup and asynchronous TTL cleanup indexes', () => {
    const indexes = AuthSessionSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ sessionId: 1 }), expect.objectContaining({ unique: true })],
        [expect.objectContaining({ userId: 1 }), expect.any(Object)],
        [
          expect.objectContaining({ expiresAt: 1 }),
          expect.objectContaining({ expireAfterSeconds: 0 }),
        ],
      ]),
    );
  });
});
