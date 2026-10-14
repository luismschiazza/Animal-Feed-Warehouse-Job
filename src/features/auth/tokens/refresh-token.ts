import { createHash, randomBytes, randomUUID } from 'node:crypto';

const UUID_PATTERN = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const TOKEN_PATTERN = new RegExp(`^(${UUID_PATTERN})\\.(${UUID_PATTERN})\\.([A-Za-z0-9_-]{43})$`);
export const REFRESH_TOKEN_LENGTH = 117;
const SESSION_ID_PATTERN = new RegExp(`^${UUID_PATTERN}$`);

export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

export interface RefreshCredential {
  sessionId: string;
  tokenId: string;
  tokenHash: string;
}

export function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function generateRefreshToken(sessionId: string = randomUUID()) {
  const tokenId = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  return {
    sessionId,
    tokenId,
    tokenHash: hashRefreshSecret(secret),
    refreshToken: `${sessionId}.${tokenId}.${secret}`,
  };
}

// Returns only identifiers and a verifier, not the raw secret.
export function parseRefreshToken(input: unknown): RefreshCredential | null {
  if (typeof input !== 'string' || input.length !== REFRESH_TOKEN_LENGTH) return null;
  const match = TOKEN_PATTERN.exec(input);
  if (!match) return null;
  const [, sessionId, tokenId, secret] = match;
  // Reject noncanonical base64url encodings of the same bytes.
  const bytes = Buffer.from(secret, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== secret) return null;
  return { sessionId, tokenId, tokenHash: hashRefreshSecret(secret) };
}
