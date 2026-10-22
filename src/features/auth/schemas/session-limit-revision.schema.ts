import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { Role } from '@/common/enums/role.enum';

export const SESSION_LIMIT_APPLICATION = 'animal-feed-warehouse';
export const DEFAULT_ORGANIZATION_SESSION_LIMIT = 3;
export const MAX_ORGANIZATION_SESSION_LIMIT = 100;
export const MAX_SESSION_LIMIT_VERSION = 2147483647;

// Configuration effect and its durable change receipt are the SAME inserted document.
// Operator provisions indexes; runtime requires find/insert/listIndexes only.
@Schema({
  collection: 'session_limit_revisions',
  versionKey: false,
  autoCreate: false,
  autoIndex: false,
})
export class SessionLimitRevision {
  @Prop({ type: String, required: true, enum: [SESSION_LIMIT_APPLICATION], immutable: true })
  applicationId: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  organizationId: Types.ObjectId;
  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: MAX_SESSION_LIMIT_VERSION,
    validate: Number.isInteger,
    immutable: true,
  })
  version: number;
  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: MAX_ORGANIZATION_SESSION_LIMIT,
    validate: Number.isInteger,
    immutable: true,
  })
  limit: number;
  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: MAX_ORGANIZATION_SESSION_LIMIT,
    validate: Number.isInteger,
    immutable: true,
  })
  previousLimit: number;
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  actorUserId: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  membershipId: Types.ObjectId;
  @Prop({ type: [String], required: true, enum: Object.values(Role), immutable: true })
  roles: Role[];
  @Prop({ type: String, required: true, immutable: true }) requestId: string;
  @Prop({ type: Date, required: true, immutable: true }) occurredAt: Date;
}
export const SessionLimitRevisionSchema = SchemaFactory.createForClass(SessionLimitRevision);
SessionLimitRevisionSchema.index(
  { applicationId: 1, organizationId: 1, version: -1 },
  { unique: true },
);
