import { createHash } from 'node:crypto';

// Deliberately one fixed S256 method, never plain/downgrade. The client generates
// 32 random bytes per attempt and keeps the canonical 43-character verifier private.
export function isRecoveryChallenge(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === value;
}
export function recoveryChallenge(verifier: unknown): string | null {
  if (!isRecoveryChallenge(verifier)) return null;
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}
