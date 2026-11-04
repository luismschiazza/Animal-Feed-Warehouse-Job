import { randomBytes, randomUUID } from 'node:crypto';
import { SESSION_LIMIT_APPLICATION } from '../schemas/session-limit-revision.schema';
import { hashRefreshSecret, isSessionId } from './refresh-token';

export const REPLACEMENT_TTL_MS = 2 * 60 * 1000;
const verifier = (secret: string) =>
  hashRefreshSecret(`${SESSION_LIMIT_APPLICATION}:session-replacement:v1:${secret}`);

// A different audience/format from JWTs and refresh tokens. Never persist the returned token.
export function generateReplacementToken() {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  return { id, secretHash: verifier(secret), token: `sr1.${id}.${secret}` };
}

export function parseReplacementToken(value: unknown) {
  if (typeof value !== 'string' || value.length !== 84) return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'sr1' || !isSessionId(parts[1])) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  const bytes = Buffer.from(parts[2], 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== parts[2]) return null;
  return { id: parts[1], secretHash: verifier(parts[2]) };
}
