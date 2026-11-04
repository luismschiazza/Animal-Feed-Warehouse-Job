import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, SchemaTypes, Types } from 'mongoose';
import { MAX_REPLACEMENT_RECOVERIES } from '../tokens/session-replacement-recovery';
import { SESSION_LIMIT_APPLICATION } from './session-limit-revision.schema';

@Schema({ collection: 'session_replacement_challenges', autoCreate: false, autoIndex: false })
export class SessionReplacement {
  @Prop({ type: String, required: true, immutable: true }) _id: string;
  @Prop({ required: true, enum: [SESSION_LIMIT_APPLICATION], immutable: true })
  applicationId: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true }) userId: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  organizationId: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  membershipId: Types.ObjectId;
  @Prop({ required: true, select: false, match: /^[a-f0-9]{64}$/, immutable: true })
  secretHash: string;
  @Prop({ required: true, select: false, match: /^[a-f0-9]{64}$/, immutable: true })
  passwordProof: string;
  @Prop({ select: false, immutable: true, match: /^[A-Za-z0-9_-]{43}$/ })
  recoveryChallenge?: string;
  @Prop({ type: String }) admittedSessionId?: string;
  @Prop({ type: String }) recoveredSessionId?: string;
  @Prop({ type: Number, default: 0, min: 0, max: MAX_REPLACEMENT_RECOVERIES })
  recoveryVersion: number;
  @Prop({ type: [String], default: [], select: false })
  recoveryRequestIds: string[];
  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'consumed', 'cancelled', 'expired', 'recovered'],
  })
  state: 'pending' | 'consumed' | 'cancelled' | 'expired' | 'recovered';
  @Prop({ required: true, immutable: true }) createdAt: Date;
  @Prop({ required: true, immutable: true }) expiresAt: Date;
  @Prop({ maxlength: 128, immutable: true }) ip?: string;
  @Prop({ maxlength: 512, immutable: true }) userAgent?: string;
}
export const SessionReplacementSchema = SchemaFactory.createForClass(SessionReplacement);
SessionReplacementSchema.index(
  { applicationId: 1, userId: 1, organizationId: 1 },
  { unique: true, partialFilterExpression: { state: 'pending' } },
);
// Cleanup only. Every operation checks expiry under the #17 server clock/fence.
SessionReplacementSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const redact = (_doc: unknown, ret: Partial<SessionReplacement>) => {
  delete ret.secretHash;
  delete ret.passwordProof;
  delete ret.recoveryChallenge;
  delete ret.recoveryRequestIds;
  return ret;
};
SessionReplacementSchema.set('toJSON', { versionKey: false, transform: redact });
SessionReplacementSchema.set('toObject', { versionKey: false, transform: redact });

// Unlike audit journals this ephemeral collection intentionally has one TTL index.
// No runtime repair/DDL. Check before each flow operation, not only once per process.
export async function verifyReplacementIndexes(model: Model<SessionReplacement>) {
  const actual = await model.collection.indexes();
  for (const [key, options] of model.schema.indexes()) {
    if (
      !actual.some(
        (index) =>
          JSON.stringify(index.key) === JSON.stringify(key) &&
          !!index.unique === !!options.unique &&
          index.expireAfterSeconds === options.expireAfterSeconds &&
          JSON.stringify(index.partialFilterExpression) ===
            JSON.stringify(options.partialFilterExpression),
      )
    )
      throw new Error('Replacement storage requires operator initialization');
  }
  if (
    actual.some(
      (index) =>
        index.expireAfterSeconds !== undefined &&
        (JSON.stringify(index.key) !== JSON.stringify({ expiresAt: 1 }) ||
          index.expireAfterSeconds !== 0),
    )
  )
    throw new Error('Unsafe replacement storage index');
}
