import { createHash } from 'node:crypto';
import { REFRESH_TOKEN_LENGTH, generateRefreshToken, parseRefreshToken } from './refresh-token';

describe('Refresh token credentials', () => {
  it('generates independent sessions and unique token secrets', () => {
    const first = generateRefreshToken();
    const second = generateRefreshToken();
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.refreshToken).not.toBe(second.refreshToken);
    expect(first.refreshToken).toHaveLength(REFRESH_TOKEN_LENGTH);
    expect(parseRefreshToken(first.refreshToken)).toEqual({
      sessionId: first.sessionId,
      tokenId: first.tokenId,
      tokenHash: first.tokenHash,
    });
  });

  it('keeps the session ID and changes the credential on rotation', () => {
    const first = generateRefreshToken();
    const next = generateRefreshToken(first.sessionId);
    expect(next.sessionId).toBe(first.sessionId);
    expect(next.tokenId).not.toBe(first.tokenId);
    expect(next.tokenHash).not.toBe(first.tokenHash);
  });

  it('hashes the complete secret including bytes after the bcrypt input limit', () => {
    const credential = generateRefreshToken();
    const secret = credential.refreshToken.split('.')[2];
    expect(credential.tokenHash).toBe(createHash('sha256').update(secret).digest('hex'));
    expect(parseRefreshToken(credential.refreshToken)).not.toHaveProperty('secret');
    const changed =
      credential.refreshToken.slice(0, 90) +
      (credential.refreshToken[90] === 'a' ? 'b' : 'a') +
      credential.refreshToken.slice(91);
    expect(parseRefreshToken(changed)?.tokenHash).not.toBe(credential.tokenHash);
  });

  it('rejects malformed, oversized, legacy and noncanonical input', () => {
    const token = generateRefreshToken().refreshToken;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = alphabet.indexOf(token[token.length - 1]);
    const noncanonical = token.slice(0, -1) + alphabet[last + 1];
    for (const input of [
      undefined,
      null,
      42,
      '',
      'x'.repeat(10_000),
      token + '.extra',
      'user-id.123.secret',
      ' ' + token,
      noncanonical,
    ]) {
      expect(parseRefreshToken(input)).toBeNull();
    }
  });
});
