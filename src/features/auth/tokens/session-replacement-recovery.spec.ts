import { randomBytes } from 'node:crypto';
import { isRecoveryChallenge, recoveryChallenge } from './session-replacement-recovery';

describe('Per-attempt replacement recovery S256 proof', () => {
  it('matches the official RFC 7636 Appendix B vector, with a fixed S256 method', () => {
    expect(recoveryChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
  it('accepts only canonical 32-byte/43-character material and hashes the ASCII verifier', () => {
    const verifier = randomBytes(32).toString('base64url');
    expect(isRecoveryChallenge(verifier)).toBe(true);
    expect(isRecoveryChallenge(recoveryChallenge(verifier))).toBe(true);
    expect(recoveryChallenge(verifier)).not.toBe(verifier);
    for (const input of [
      null,
      undefined,
      {},
      '',
      'a'.repeat(42),
      'a'.repeat(44),
      'a'.repeat(43),
      verifier + '=',
      'sr1.' + verifier,
    ]) {
      expect(recoveryChallenge(input)).toBeNull();
      expect(isRecoveryChallenge(input)).toBe(false);
    }
  });
});
