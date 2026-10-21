import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

export enum RevocationScope {
  SESSION = 'session',
  USER = 'user',
  ORGANIZATION = 'organization',
}
export enum RevocationAction {
  LOGOUT = 'logout',
  REVOKE = 'revoke_session',
  OTHERS = 'revoke_others',
  ALL = 'revoke_all',
  ADMIN_REVOKE = 'organization_revoke_session',
  ADMIN_ALL = 'organization_revoke_all',
  REPLAY = 'refresh_reuse',
  LIMIT = 'rotation_limit',
}

// Append-only authoritative rules AND audit. Deliberately NO TTL or delete API.
@Schema({
  collection: 'auth_session_revocations',
  autoCreate: false,
  autoIndex: false,
  timestamps: { createdAt: true, updatedAt: false },
})
export class SessionRevocation {
  @Prop({ type: String, enum: Object.values(RevocationScope), required: true })
  scope: RevocationScope;
  @Prop({ type: String, enum: Object.values(RevocationAction), required: true })
  action: RevocationAction;
  @Prop({ type: String, enum: ['user', 'system'], required: true }) initiator: 'user' | 'system';
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  actorUserId: Types.ObjectId | null;
  @Prop({ type: String, default: null }) actorSessionId: string | null;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', default: null })
  actorOrganizationId: Types.ObjectId | null;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) targetUserId?: Types.ObjectId;
  @Prop({ type: String }) targetSessionId?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization' }) organizationId?: Types.ObjectId;
  @Prop({ type: Date }) revokedBefore?: Date;
  @Prop({ type: String }) excludedSessionId?: string;
  @Prop({ type: Date, required: true }) occurredAt: Date;
  @Prop({ type: String, immutable: true }) requestId?: string;
  createdAt: Date;
}
export const SessionRevocationSchema = SchemaFactory.createForClass(SessionRevocation);
SessionRevocationSchema.pre('validate', function () {
  const permitted: Record<RevocationScope, readonly RevocationAction[]> = {
    [RevocationScope.SESSION]: [
      RevocationAction.LOGOUT,
      RevocationAction.REVOKE,
      RevocationAction.ADMIN_REVOKE,
      RevocationAction.REPLAY,
      RevocationAction.LIMIT,
    ],
    [RevocationScope.USER]: [RevocationAction.OTHERS, RevocationAction.ALL],
    [RevocationScope.ORGANIZATION]: [RevocationAction.ADMIN_ALL],
  };
  if (!permitted[this.scope]?.includes(this.action))
    this.invalidate('action', 'Action does not match scope');
  if (this.initiator === 'user' && (!this.actorUserId || !this.actorSessionId))
    this.invalidate('initiator', 'Authenticated actor required');
  if (this.action === RevocationAction.LOGOUT && this.actorSessionId !== this.targetSessionId)
    this.invalidate('actorSessionId', 'Logout must target the current session');
  if (
    [RevocationAction.REPLAY, RevocationAction.LIMIT].includes(this.action) !==
    (this.initiator === 'system')
  )
    this.invalidate('initiator', 'Invalid initiator for action');
  if (this.scope !== RevocationScope.ORGANIZATION && !this.targetUserId)
    this.invalidate('targetUserId', 'Target account required');
  if (this.scope === RevocationScope.SESSION && !this.targetSessionId)
    this.invalidate('targetSessionId', 'Target session required');
  if (this.scope !== RevocationScope.SESSION && !this.revokedBefore)
    this.invalidate('revokedBefore', 'Cutoff required');
  if (
    this.scope === RevocationScope.ORGANIZATION ||
    this.action === RevocationAction.ADMIN_REVOKE
  ) {
    if (
      !this.organizationId ||
      !this.actorOrganizationId ||
      this.organizationId.toString() !== this.actorOrganizationId.toString()
    )
      this.invalidate('organizationId', 'Administrative organization mismatch');
  }
  if (
    [
      RevocationAction.LOGOUT,
      RevocationAction.REVOKE,
      RevocationAction.ALL,
      RevocationAction.OTHERS,
    ].includes(this.action) &&
    this.targetUserId?.toString() !== this.actorUserId?.toString()
  )
    this.invalidate('targetUserId', 'Owned account required');
  if (this.action === RevocationAction.OTHERS && this.excludedSessionId !== this.actorSessionId)
    this.invalidate('excludedSessionId', 'Only current session can be excluded');
  if (this.action !== RevocationAction.OTHERS && this.excludedSessionId !== undefined)
    this.invalidate('excludedSessionId', 'Unexpected session exclusion');
});
SessionRevocationSchema.index(
  { targetSessionId: 1 },
  { unique: true, partialFilterExpression: { scope: RevocationScope.SESSION } },
);
SessionRevocationSchema.index({ scope: 1, targetUserId: 1, revokedBefore: -1 });
SessionRevocationSchema.index({ scope: 1, organizationId: 1, revokedBefore: -1 });
