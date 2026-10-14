import { Module } from '@nestjs/common';
import { AuthSessionModelModule } from './models/auth-session-model.module';
import { AuthSessionsService } from './services/auth-sessions.service';

@Module({
  imports: [AuthSessionModelModule],
  providers: [AuthSessionsService],
  exports: [AuthSessionsService],
})
export class AuthSessionsModule {}
