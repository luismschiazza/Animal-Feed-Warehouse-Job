import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ClientSession } from 'mongoose';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
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
import { hashRefreshSecret } from '../tokens/refresh-token';
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

const PASSWORD_LOGIN_PROOF = Symbol('server-only-password-validation');

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private sessions: AuthSessionsService,
    private organizations: OrganizationAccessService,
    private audit: SecurityAuditService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    let user: User;
    let valid = false;
    try {
      if (typeof email === 'string' && typeof password === 'string') {
        const candidate = await this.usersService.findOneByEmailWithPassword(
          email.trim().toLowerCase(),
        );
        if (
          candidate?.status === AccountStatus.ACTIVE &&
          (await bcrypt.compare(password, candidate.password))
        ) {
          user = candidate;
          valid = true;
        }
      }
    } catch (error) {
      await this.audit.record(AuditEvent.LOGIN, 'error', 'auth');
      throw error;
    }
    if (!valid) {
      await this.audit.record(AuditEvent.LOGIN, 'denied', 'auth');
      return null;
    }
    const identity = this.personalIdentity(user);
    // Non-enumerable server-only provenance: cannot be supplied in JSON or synthesized from a JWT.
    // Carried on the exact Passport result, not tied to one DI instance (multiple apps may share Passport).
    Object.defineProperty(identity, PASSWORD_LOGIN_PROOF, {
      value: Object.freeze({ id: identity.id, proof: hashRefreshSecret(user.password) }),
      enumerable: false,
      writable: false,
      configurable: false,
    });
    return identity;
  }

  replacementLoginProof(user: AuthenticatedUser) {
    const proof = (
      user as AuthenticatedUser & {
        [PASSWORD_LOGIN_PROOF]?: { id: string; proof: string };
      }
    )?.[PASSWORD_LOGIN_PROOF];
    if (!proof || proof.id !== user.id) throw new UnauthorizedException('Password proof required');
    return proof.proof;
  }

  async requireReplacementIdentity(
    userId: string,
    organizationId: string,
    passwordProof: string,
    membershipId?: string,
    session?: ClientSession,
  ) {
    if (
      typeof userId !== 'string' ||
      typeof organizationId !== 'string' ||
      !/^[a-f0-9]{24}$/i.test(userId) ||
      !/^[a-f0-9]{24}$/i.test(organizationId) ||
      typeof passwordProof !== 'string' ||
      !/^[a-f0-9]{64}$/.test(passwordProof) ||
      (membershipId !== undefined &&
        (typeof membershipId !== 'string' || !/^[a-f0-9]{24}$/i.test(membershipId)))
    )
      throw new UnauthorizedException('Invalid replacement context');
    const account = await this.usersService.findOneByIdWithPassword(userId, session);
    if (
      !account ||
      account.status !== AccountStatus.ACTIVE ||
      typeof account.password !== 'string' ||
      hashRefreshSecret(account.password) !== passwordProof
    )
      throw new UnauthorizedException('Invalid replacement context');
    const access = await this.organizations.requireActiveMembership(
      userId,
      organizationId,
      session,
    );
    if (membershipId !== undefined && access.membershipId !== membershipId)
      throw new UnauthorizedException('Invalid replacement context');
    return this.tenantIdentity(account, access);
  }

  async completeReplacement(
    userId: string,
    organizationId: string,
    membershipId: string,
    passwordProof: string,
    sessionId: string,
    refreshToken: string,
  ) {
    const identity = await this.requireReplacementIdentity(
      userId,
      organizationId,
      passwordProof,
      membershipId,
    );
    const active = await this.sessions.findActive(sessionId, userId);
    if (active.organizationId?.toString() !== organizationId)
      throw new UnauthorizedException('Invalid replacement context');
    const pair = this.issueTokenPair(identity, sessionId, refreshToken);
    await this.audit.record(AuditEvent.LOGIN, 'allowed', 'auth', { ...identity, sessionId });
    return pair;
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
    let actor: AuthenticatedUser & { sessionId?: string };
    let pair: ReturnType<AuthService['issueTokenPair']>;
    try {
      // Re-read after password validation; do not audit a requested tenant as verified.
      const account = await this.requireActiveAccount(user.id);
      actor = this.personalIdentity(account);
      const access =
        organizationId === undefined
          ? undefined
          : await this.organizations.requireActiveMembership(account.id, organizationId);
      const identity = access ? this.tenantIdentity(account, access) : actor;
      const session = await this.sessions.create(
        account.id,
        metadata,
        access?.organizationId,
        identity,
      );
      actor = { ...identity, sessionId: session.sessionId };
      pair = this.issueTokenPair(identity, session.sessionId, session.refreshToken);
    } catch (error) {
      await this.audit.record(AuditEvent.LOGIN, this.audit.result(error), 'auth', actor);
      throw error;
    }
    // No credentials leave the service before the audit is acknowledged.
    await this.audit.record(AuditEvent.LOGIN, 'allowed', 'auth', actor);
    return pair;
  }

  async refresh(refreshToken: string) {
    let actor: AuthenticatedUser & { sessionId: string };
    let pair: ReturnType<AuthService['issueTokenPair']>;
    try {
      const session = await this.sessions.rotate(refreshToken);
      const user = await this.validateSession(session.userId, session.sessionId);
      actor = { ...user, sessionId: session.sessionId };
      pair = this.issueTokenPair(user, session.sessionId, session.refreshToken);
    } catch (error) {
      await this.audit.record(AuditEvent.REFRESH, this.audit.result(error), 'auth');
      throw error;
    }
    await this.audit.record(AuditEvent.REFRESH, 'allowed', 'auth', actor);
    return pair;
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
