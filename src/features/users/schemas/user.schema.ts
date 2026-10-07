import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from '@/common/enums/role.enum';

@Schema()
export class User extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop()
  emailVerifiedAt: Date;

  @Prop({ select: false })
  rememberToken: string;

  @Prop({ select: false })
  refreshTokenHash: string;

  @Prop({ type: [String], enum: Object.values(Role), default: [Role.STUDENT] })
  roles: Role[];

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.password;
    delete ret.rememberToken;
    delete ret.refreshTokenHash;
    return ret;
  },
});
