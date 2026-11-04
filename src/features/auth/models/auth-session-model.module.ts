import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthSession, AuthSessionSchema } from '../schemas/auth-session.schema';
import {
  SessionReplacement,
  SessionReplacementSchema,
} from '../schemas/session-replacement.schema';
import { SessionRevocation, SessionRevocationSchema } from '../schemas/session-revocation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: SessionRevocation.name, schema: SessionRevocationSchema },
      { name: SessionReplacement.name, schema: SessionReplacementSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class AuthSessionModelModule {}
