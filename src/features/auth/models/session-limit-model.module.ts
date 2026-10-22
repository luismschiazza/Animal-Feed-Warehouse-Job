import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SessionLimitRevision,
  SessionLimitRevisionSchema,
} from '../schemas/session-limit-revision.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SessionLimitRevision.name, schema: SessionLimitRevisionSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class SessionLimitModelModule {}
