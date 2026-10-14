import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role } from '@/common/enums/role.enum';
import { UsersService } from '@/features/users/services/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthSessionsService, SessionMetadata } from './auth-sessions.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private sessions: AuthSessionsService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersService.findOneByEmailWithPassword(normalizedEmail);
    if (!user) return null;
    if (!(await bcrypt.compare(password, user.password))) return null;
    return { id: user.id, email: user.email, name: user.name, roles: user.roles as Role[] };
  }

  async validateSession(userId: string, sessionId: string) {
    await this.sessions.findActive(sessionId, userId);
    const user = await this.usersService.findOneById(userId);
    if (!user) throw new UnauthorizedException('Invalid or inactive session');
    return user;
  }

  async login(user: AuthenticatedUser, metadata: SessionMetadata = {}) {
    const session = await this.sessions.create(user.id, metadata);
    return this.issueTokenPair(user, session.sessionId, session.refreshToken);
  }

  async refresh(refreshToken: string) {
    const session = await this.sessions.rotate(refreshToken);
    // Recheck after rotation: a concurrent replay may already have revoked it.
    const user = await this.validateSession(session.userId, session.sessionId);
    return this.issueTokenPair(
      { id: user.id, email: user.email, name: user.name, roles: user.roles as Role[] },
      session.sessionId,
      session.refreshToken,
    );
  }

  async logout(userId: string, sessionId: string) {
    await this.sessions.revoke(sessionId, userId);
    return { message: 'Logged out successfully' };
  }

  private issueTokenPair(user: AuthenticatedUser, sessionId: string, refreshToken: string) {
    const payload: JwtPayload = {
      email: user.email,
      sub: user.id,
      sid: sessionId,
      roles: user.roles,
    };
    const accessToken = this.jwtService.sign(payload);
    const decoded = this.jwtService.decode(accessToken) as { exp?: number };
    const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : null;
    return {
      token_type: 'Bearer',
      expires_in: expiresIn,
      session_id: sessionId,
      access_token: accessToken,
      refresh_token: refreshToken,
      accessToken,
      refreshToken,
    };
  }
}
