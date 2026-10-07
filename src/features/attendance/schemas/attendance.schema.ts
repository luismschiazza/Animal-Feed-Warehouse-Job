import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class Attendance extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  student: string;

  @Prop({ type: Types.ObjectId, ref: 'Discipline', required: true })
  discipline: string;

  @Prop({ required: true })
  date: Date;

  @Prop({
    type: String,
    enum: ['PRESENT', 'ABSENT', 'LATE', 'JUSTIFIED'],
    required: true,
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recordedBy: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);

AttendanceSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});
