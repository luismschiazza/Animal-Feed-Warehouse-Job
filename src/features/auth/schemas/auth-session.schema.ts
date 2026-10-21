import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum SessionRevocationReason {
  LOGOUT = 'logout',
  REFRESH_REUSE = 'refresh_reuse',
  ROTATION_LIMIT = 'rotation_limit',
}

// These verifiers prove reuse without storing the refresh token itself.
@Schema({ _id: false })
export class ConsumedRefreshToken {
  @Prop({ required: true })
  tokenId: string;

  @Prop({ required: true, match: /^[a-f0-9]{64}$/ })
  tokenHash: string;

  @Prop({ required: true })
  consumedAt: Date;
}

export const ConsumedRefreshTokenSchema = SchemaFactory.createForClass(ConsumedRefreshToken);

@Schema({ collection: 'auth_sessions', timestamps: true })
export class AuthSession {
  @Prop({ required: true, immutable: true })
  sessionId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, immutable: true })
  userId: Types.ObjectId;

  // null means personal account access, not a default/global tenant.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', default: null, immutable: true })
  organizationId: Types.ObjectId | null;

  @Prop({ required: true })
  currentTokenId: string;

  @Prop({ required: true, select: false, match: /^[a-f0-9]{64}$/ })
  currentTokenHash: string;

  @Prop({ required: true, default: 0, min: 0 })
  rotationVersion: number;

  @Prop({ type: [ConsumedRefreshTokenSchema], default: [], select: false })
  consumedTokens: ConsumedRefreshToken[];

  @Prop({ required: true })
  lastUsedAt: Date;

  // Fixed absolute expiration for the session and every token in its family.
  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  @Prop({ type: String, enum: Object.values(SessionRevocationReason), default: null })
  revocationReason: SessionRevocationReason | null;

  @Prop({ maxlength: 128 })
  ip?: string;

  @Prop({ maxlength: 512 })
  userAgent?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type AuthSessionDocument = HydratedDocument<AuthSession>;
export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);

AuthSessionSchema.index({ sessionId: 1 }, { unique: true });
AuthSessionSchema.index({ userId: 1 });
AuthSessionSchema.index({ userId: 1, _id: -1 });
AuthSessionSchema.index({ organizationId: 1, _id: -1 });
// Cleanup only: request validation must still check expiresAt explicitly.
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// select:false is not enough: newly created documents still contain verifiers.
const redactVerifiers = (_document: unknown, ret: Partial<AuthSession>) => {
  delete ret.currentTokenHash;
  delete ret.consumedTokens;
  return ret;
};
AuthSessionSchema.set('toJSON', { versionKey: false, transform: redactVerifiers });
AuthSessionSchema.set('toObject', { versionKey: false, transform: redactVerifiers });
