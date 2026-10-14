import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Role } from '@/common/enums/role.enum';
import { Organization } from './organization.schema';

export enum MembershipStatus {
  INVITED = 'invited',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
}

@Schema({ collection: 'organization_memberships', timestamps: true })
export class OrganizationMembership {
  @Prop({ type: SchemaTypes.ObjectId, ref: Organization.name, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // A created/invited record is not automatically an authorized membership.
  @Prop({
    type: String,
    enum: Object.values(MembershipStatus),
    required: true,
    default: MembershipStatus.INVITED,
  })
  status: MembershipStatus;

  @Prop({
    type: [String],
    enum: Object.values(Role),
    required: true,
    default: [Role.CUSTOMER],
    validate: {
      validator: (roles: Role[]) =>
        Array.isArray(roles) &&
        roles.length > 0 &&
        roles.length <= Object.values(Role).length &&
        new Set(roles).size === roles.length,
      message: 'Membership roles must be nonempty, unique and bounded',
    },
  })
  roles: Role[];

  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationMembershipDocument = HydratedDocument<OrganizationMembership>;
export const OrganizationMembershipSchema = SchemaFactory.createForClass(OrganizationMembership);

// A user may belong to several organizations, but has only one membership per pair.
OrganizationMembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
OrganizationMembershipSchema.index({ userId: 1, status: 1 });
