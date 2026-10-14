import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthSession, AuthSessionSchema } from '../schemas/auth-session.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: AuthSession.name, schema: AuthSessionSchema }])],
  exports: [MongooseModule],
})
export class AuthSessionModelModule {}
