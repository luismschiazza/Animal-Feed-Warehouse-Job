import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PolicySubject } from '@/common/authorization/policy.types';
import { AuthSessionsService } from './auth-sessions.service';
import { AuthService } from './auth.service';

@Injectable()
export class SessionManagementService {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: AuthSessionsService,
  ) {}

  async listOwn(actor: PolicySubject, limit = 25, before?: string) {
    // Revalidate account/session/membership in the service as well as the HTTP guard.
    // A personal login may inspect its own sessions across organizations, not their data.
    if (!actor?.id || !actor.sessionId) throw new UnauthorizedException('Invalid session context');
    const identity = await this.auth.validateSession(actor.id, actor.sessionId);
    if (identity.organizationId !== actor.organizationId)
      throw new UnauthorizedException('Invalid session context');
    return this.sessions.listOwnedActive(identity.id, actor.sessionId, limit, before);
  }
}
