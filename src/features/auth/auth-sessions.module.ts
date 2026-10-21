import { Module } from '@nestjs/common';
import { SecurityAuditModule } from '@/common/audit/security-audit.module';
import { AuthSessionModelModule } from './models/auth-session-model.module';
import { AuthSessionsService } from './services/auth-sessions.service';
import { SessionRevocationsService } from './services/session-revocations.service';

@Module({
  imports: [AuthSessionModelModule, SecurityAuditModule],
  providers: [AuthSessionsService, SessionRevocationsService],
  exports: [AuthSessionsService, SessionRevocationsService],
})
export class AuthSessionsModule {}
