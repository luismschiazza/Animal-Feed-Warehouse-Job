import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { Role } from '../enums/role.enum';

export enum AuditEvent {
  LOGIN = 'login',
  REFRESH = 'refresh',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  REQUEST = 'request',
}
export type AuditResult = 'allowed' | 'denied' | 'error';
export type AuditPhase = 'auth' | 'guard' | 'service' | 'http';

// No TTL: retention is deliberate, not coupled to session expiry.
@Schema({
  collection: 'security_audit_events',
  versionKey: false,
  // Explicit operator DDL in every environment; never depend on dotenv load order.
  autoCreate: false,
  autoIndex: false,
})
export class SecurityAuditRecord {
  @Prop({ type: String, required: true, enum: Object.values(AuditEvent), immutable: true })
  event: AuditEvent;
  @Prop({ type: String, required: true, enum: ['allowed', 'denied', 'error'], immutable: true })
  result: AuditResult;
  @Prop({
    type: String,
    required: true,
    enum: ['auth', 'guard', 'service', 'http'],
    immutable: true,
  })
  phase: AuditPhase;
  @Prop({ type: Date, required: true, immutable: true }) occurredAt: Date;
  @Prop({ type: String, required: true, immutable: true }) requestId: string;
  @Prop({ type: SchemaTypes.ObjectId, default: null, immutable: true })
  actorUserId: Types.ObjectId | null;
  @Prop({ type: [String], enum: Object.values(Role), immutable: true }) roles: Role[];
  @Prop({ type: SchemaTypes.ObjectId, default: null, immutable: true })
  membershipId: Types.ObjectId | null;
  @Prop({ type: SchemaTypes.ObjectId, default: null, immutable: true })
  organizationId: Types.ObjectId | null;
  @Prop({ type: String, default: null, immutable: true }) sessionId: string | null;
  @Prop({ type: String, immutable: true }) resource?: string;
  @Prop({ type: String, immutable: true }) action?: string;
  @Prop({ type: String, immutable: true }) targetId?: string;
  @Prop({
    type: String,
    enum: ['accepted', 'rejected', 'unavailable'],
    required: true,
    immutable: true,
  })
  reason: string;
  @Prop({ type: String, immutable: true }) method?: string;
  @Prop({ type: String, immutable: true }) ip?: string;
}
export const SecurityAuditSchema = SchemaFactory.createForClass(SecurityAuditRecord);
SecurityAuditSchema.index({ organizationId: 1, _id: -1 });
SecurityAuditSchema.index({ actorUserId: 1, _id: -1 });
SecurityAuditSchema.index({ requestId: 1 });
