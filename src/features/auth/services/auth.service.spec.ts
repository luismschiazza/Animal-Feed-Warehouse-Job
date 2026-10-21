import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { OrganizationAccessService } from '@/features/organizations/services/organization-access.service';
import { UsersService } from '@/features/users/services/users.service';
import { AuthSessionsService } from './auth-sessions.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const account = {
    id: 'user-id',
    email: 'developer@example.com',
    name: 'Developer',
    roles: [Role.SYSTEM_ADMIN],
    status: AccountStatus.ACTIVE,
  };
  const personal = { ...account, roles: [Role.CUSTOMER] };
  const users = { findOneByEmailWithPassword: jest.fn(), findOneById: jest.fn() };
  const jwt = { sign: jest.fn(), decode: jest.fn() };
  const sessions = {
    create: jest.fn(),
    rotate: jest.fn(),
    findActive: jest.fn(),
    revoke: jest.fn(),
  };
  const organizations = { requireActiveMembership: jest.fn() };
  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SecurityAuditService, useValue: { record: jest.fn(), result: () => 'denied' } },
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
        { provide: AuthSessionsService, useValue: sessions },
        { provide: OrganizationAccessService, useValue: organizations },
      ],
    }).compile();
    service = module.get(AuthService);
    jwt.sign.mockReturnValue('signed-token');
    jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });
    users.findOneById.mockResolvedValue(account);
    sessions.findActive.mockResolvedValue({ organizationId: null });
    sessions.create.mockResolvedValue({ sessionId: 'sid', refreshToken: 'refresh' });
    organizations.requireActiveMembership.mockResolvedValue({
      userId: account.id,
      organizationId: 'org-A',
      membershipId: 'member-A',
      roles: [Role.MANAGER],
    });
  });

  it('validates credentials without returning password or global administrative permissions', async () => {
    users.findOneByEmailWithPassword.mockResolvedValue({
      ...account,
      password: await bcrypt.hash('pass', 4),
    });
    await expect(service.validateUser(' Developer@Example.com ', 'pass')).resolves.toEqual(
      personal,
    );
    expect(users.findOneByEmailWithPassword).toHaveBeenCalledWith('developer@example.com');
    await expect(service.validateUser(account.email, 'wrong')).resolves.toBeNull();
  });
  it.each([undefined, AccountStatus.PENDING, AccountStatus.SUSPENDED])(
    'rejects credentials for account status %s',
    async (status) => {
      users.findOneByEmailWithPassword.mockResolvedValue({
        ...account,
        status,
        password: await bcrypt.hash('pass', 4),
      });
      await expect(service.validateUser(account.email, 'pass')).resolves.toBeNull();
    },
  );
  it('creates a personal session without an implicit organization', async () => {
    const response = await service.login(personal, { ip: '127.0.0.1' });
    expect(sessions.create).toHaveBeenCalledWith(account.id, { ip: '127.0.0.1' }, undefined);
    expect(organizations.requireActiveMembership).not.toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: account.id,
      sid: 'sid',
      email: account.email,
      roles: [Role.CUSTOMER],
    });
    expect(response).toMatchObject({
      organization_id: null,
      session_id: 'sid',
      access_token: 'signed-token',
      accessToken: 'signed-token',
      refresh_token: 'refresh',
      refreshToken: 'refresh',
    });
  });
  it('binds a tenant session only after validating current membership and stored roles', async () => {
    const response = await service.login(personal, {}, 'org-A');
    expect(organizations.requireActiveMembership).toHaveBeenCalledWith(account.id, 'org-A');
    expect(sessions.create).toHaveBeenCalledWith(account.id, {}, 'org-A');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-A', roles: [Role.MANAGER] }),
    );
    expect(response.organization_id).toBe('org-A');
  });
  it('does not create a session if the account was suspended after password validation', async () => {
    users.findOneById.mockResolvedValue({ ...account, status: AccountStatus.SUSPENDED });
    await expect(service.login(personal)).rejects.toThrow(UnauthorizedException);
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it('does not persist/sign on membership or database failure', async () => {
    organizations.requireActiveMembership.mockRejectedValue(
      new Error('Organization access denied'),
    );
    await expect(service.login(personal, {}, 'org-B')).rejects.toThrow(
      'Organization access denied',
    );
    expect(sessions.create).not.toHaveBeenCalled();
    sessions.create.mockRejectedValue(new Error('database unavailable'));
    await expect(service.login(personal)).rejects.toThrow('database unavailable');
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('reloads the session organization and membership on each access', async () => {
    sessions.findActive.mockResolvedValue({ organizationId: 'org-A' });
    const user = await service.validateSession(account.id, 'sid');
    expect(organizations.requireActiveMembership).toHaveBeenCalledWith(account.id, 'org-A');
    expect(user).toMatchObject({
      organizationId: 'org-A',
      membershipId: 'member-A',
      roles: [Role.MANAGER],
      membershipStatus: 'active',
      organizationStatus: 'active',
      status: AccountStatus.ACTIVE,
    });
  });
  it('refreshes within the same organization using current membership roles', async () => {
    sessions.rotate.mockResolvedValue({
      sessionId: 'sid',
      userId: account.id,
      refreshToken: 'rotated',
    });
    sessions.findActive.mockResolvedValue({ organizationId: 'org-A' });
    await service.refresh('old');
    expect(sessions.findActive).toHaveBeenCalledWith('sid', account.id);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-A', roles: [Role.MANAGER] }),
    );
  });
  it('issues no tokens for deleted/suspended accounts or revoked memberships after rotation', async () => {
    sessions.rotate.mockResolvedValue({
      sessionId: 'sid',
      userId: account.id,
      refreshToken: 'rotated',
    });
    users.findOneById.mockResolvedValue(null);
    await expect(service.refresh('old')).rejects.toThrow(UnauthorizedException);
    users.findOneById.mockResolvedValue({ ...account, status: AccountStatus.SUSPENDED });
    await expect(service.refresh('old')).rejects.toThrow(UnauthorizedException);
    users.findOneById.mockResolvedValue(account);
    sessions.findActive.mockResolvedValue({ organizationId: 'org-A' });
    organizations.requireActiveMembership.mockRejectedValue(
      new Error('Organization access denied'),
    );
    await expect(service.refresh('old')).rejects.toThrow('Organization access denied');
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('propagates invalid refresh and database errors without issuing tokens', async () => {
    sessions.rotate.mockRejectedValue(new UnauthorizedException());
    await expect(service.refresh('bad')).rejects.toThrow(UnauthorizedException);
    sessions.rotate.mockRejectedValue(new Error('database unavailable'));
    await expect(service.refresh('bad')).rejects.toThrow('database unavailable');
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('logs out only the authenticated session', async () => {
    await expect(service.logout(account.id, 'sid')).resolves.toEqual({
      message: 'Logged out successfully',
    });
    expect(sessions.revoke).toHaveBeenCalledWith('sid', account.id);
  });
});
