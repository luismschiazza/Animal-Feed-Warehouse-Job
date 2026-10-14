import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { MembershipStatus } from '@/features/organizations/schemas/organization-membership.schema';
import { OrganizationStatus } from '@/features/organizations/schemas/organization.schema';
import {
  OrganizationAccess,
  OrganizationAccessService,
} from '@/features/organizations/services/organization-access.service';
import { User } from '@/features/users/interfaces/user.interface';
import { UsersService } from '@/features/users/services/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthSessionsService, SessionMetadata } from './auth-sessions.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  status: AccountStatus;
  organizationId?: string;
  membershipId?: string;
  organizationStatus?: OrganizationStatus;
  membershipStatus?: MembershipStatus;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private sessions: AuthSessionsService,
    private organizations: OrganizationAccessService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersService.findOneByEmailWithPassword(email.trim().toLowerCase());
    if (!user || user.status !== AccountStatus.ACTIVE) return null;
    if (!(await bcrypt.compare(password, user.password))) return null;
    return this.personalIdentity(user);
  }

  async validateSession(userId: string, sessionId: string): Promise<AuthenticatedUser> {
    const session = await this.sessions.findActive(sessionId, userId);
    const user = await this.requireActiveAccount(userId);
    if (!session.organizationId) return this.personalIdentity(user);
    // Never use the account's old global roles or stale JWT roles as tenant permissions.
    const access = await this.organizations.requireActiveMembership(
      userId,
      session.organizationId.toString(),
    );
    return this.tenantIdentity(user, access);
  }

  async login(user: AuthenticatedUser, metadata: SessionMetadata = {}, organizationId?: string) {
    // Re-read after password validation: do not persist a session using stale account state.
    const account = await this.requireActiveAccount(user.id);
    const access =
      organizationId === undefined
        ? undefined
        : await this.organizations.requireActiveMembership(account.id, organizationId);
    const identity = access ? this.tenantIdentity(account, access) : this.personalIdentity(account);
    const session = await this.sessions.create(account.id, metadata, access?.organizationId);
    return this.issueTokenPair(identity, session.sessionId, session.refreshToken);
  }

  async refresh(refreshToken: string) {
    const session = await this.sessions.rotate(refreshToken);
    // Recheck current account/membership after the atomic rotation; failure issues no credentials.
    const user = await this.validateSession(session.userId, session.sessionId);
    return this.issueTokenPair(user, session.sessionId, session.refreshToken);
  }

  async logout(userId: string, sessionId: string) {
    await this.sessions.revoke(sessionId, userId);
    return { message: 'Logged out successfully' };
  }

  private async requireActiveAccount(userId: string) {
    const user = await this.usersService.findOneById(userId);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid or inactive account');
    }
    return user;
  }

  private personalIdentity(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: [Role.CUSTOMER],
      status: user.status,
    };
  }

  private tenantIdentity(user: User, access: OrganizationAccess): AuthenticatedUser {
    return {
      ...this.personalIdentity(user),
      roles: access.roles,
      organizationId: access.organizationId,
      membershipId: access.membershipId,
      organizationStatus: OrganizationStatus.ACTIVE,
      membershipStatus: MembershipStatus.ACTIVE,
    };
  }

  private issueTokenPair(user: AuthenticatedUser, sessionId: string, refreshToken: string) {
    const payload: JwtPayload = {
      email: user.email,
      sub: user.id,
      sid: sessionId,
      roles: user.roles,
      ...(user.organizationId ? { organizationId: user.organizationId } : {}),
    };
    const accessToken = this.jwtService.sign(payload);
    const decoded = this.jwtService.decode(accessToken) as { exp?: number };
    const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : null;
    return {
      token_type: 'Bearer',
      expires_in: expiresIn,
      session_id: sessionId,
      organization_id: user.organizationId ?? null,
      access_token: accessToken,
      refresh_token: refreshToken,
      accessToken,
      refreshToken,
    };
  }
}
