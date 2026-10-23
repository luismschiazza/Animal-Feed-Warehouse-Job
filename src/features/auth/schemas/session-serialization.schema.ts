import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Mutable coordination metadata, NOT an active-session counter or revocation authority.
@Schema({ collection: 'session_serialization', autoCreate: false, autoIndex: false })
export class SessionSerialization {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true, min: 0 })
  sequence: number;

  @Prop({ required: true })
  serverNow: Date;
}
export const SessionSerializationSchema = SchemaFactory.createForClass(SessionSerialization);
