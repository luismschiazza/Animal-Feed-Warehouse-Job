export interface SessionSummary {
  sessionId: string;
  // Only the organization-administration endpoint includes the owning account ID.
  userId?: string;
  organizationId: string | null;
  current: boolean;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  // Existing lastUsedAt changes on login/refresh, not on every API request.
  lastRefreshedAt: Date;
  expiresAt: Date;
}

export interface SessionPage {
  items: SessionSummary[];
  // Public pagination position, not an authentication credential.
  nextCursor: string | null;
}
