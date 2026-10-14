import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum OrganizationStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Schema({ collection: 'organizations', timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true, minlength: 1, maxlength: 200 })
  name: string;

  @Prop({
    type: String,
    enum: Object.values(OrganizationStatus),
    required: true,
    default: OrganizationStatus.ACTIVE,
  })
  status: OrganizationStatus;

  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationDocument = HydratedDocument<Organization>;
export const OrganizationSchema = SchemaFactory.createForClass(Organization);
