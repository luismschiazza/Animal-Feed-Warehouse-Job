import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class Grade extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  student: string;

  @Prop({ type: Types.ObjectId, ref: 'Discipline', required: true })
  discipline: string;

  @Prop({ required: true })
  value: number;

  @Prop({ type: String, required: true })
  type: string;

  @Prop({ type: String, required: true })
  term: string;

  @Prop()
  comments?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recordedBy: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const GradeSchema = SchemaFactory.createForClass(Grade);

GradeSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});
