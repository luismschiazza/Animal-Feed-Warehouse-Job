import { Module } from '@nestjs/common';
import { SecurityAuditModule } from '@/common/audit/security-audit.module';
import { AuthSessionModelModule } from './models/auth-session-model.module';
import { SessionLimitModelModule } from './models/session-limit-model.module';
import { SessionSerializationModule } from './models/session-serialization.module';
import { AuthSessionsService } from './services/auth-sessions.service';
import { SessionRevocationsService } from './services/session-revocations.service';

@Module({
  imports: [
    AuthSessionModelModule,
    SecurityAuditModule,
    SessionLimitModelModule,
    SessionSerializationModule,
  ],
  providers: [AuthSessionsService, SessionRevocationsService],
  exports: [AuthSessionsService, SessionRevocationsService, SessionSerializationModule],
})
export class AuthSessionsModule {}
