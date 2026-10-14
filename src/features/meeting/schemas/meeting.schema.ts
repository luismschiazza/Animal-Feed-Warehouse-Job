import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { addTenantFields } from '@/common/authorization/tenant-schema';

@Schema()
export class Meeting extends Document {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  start_at: Date;

  @Prop({ required: true })
  end_at: Date;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  participants: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
addTenantFields(MeetingSchema, ['createdBy'], [], ['participants']);

MeetingSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});
