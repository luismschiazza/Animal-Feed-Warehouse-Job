import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SessionSerialization,
  SessionSerializationSchema,
} from '../schemas/session-serialization.schema';
import { SessionSerializationService } from '../services/session-serialization.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SessionSerialization.name, schema: SessionSerializationSchema },
    ]),
  ],
  providers: [SessionSerializationService],
  exports: [SessionSerializationService, MongooseModule],
})
export class SessionSerializationModule {}
