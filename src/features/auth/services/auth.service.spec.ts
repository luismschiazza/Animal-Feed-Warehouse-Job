import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Role } from '@/common/enums/role.enum';
import { UsersService } from '@/features/users/services/users.service';
import { AuthSessionsService } from './auth-sessions.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const user = {
    id: 'user-id',
    email: 'developer@example.com',
    name: 'Developer',
    roles: [Role.MANAGER],
  };
  const users = { findOneByEmailWithPassword: jest.fn(), findOneById: jest.fn() };
  const jwt = { sign: jest.fn(), decode: jest.fn() };
  const sessions = {
    create: jest.fn(),
    rotate: jest.fn(),
    findActive: jest.fn(),
    revoke: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
        { provide: AuthSessionsService, useValue: sessions },
      ],
    }).compile();
    service = module.get(AuthService);
    jwt.sign.mockReturnValue('signed-token');
    jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });
    users.findOneById.mockResolvedValue(user);
  });

  it('validates credentials without returning the password', async () => {
    users.findOneByEmailWithPassword.mockResolvedValue({
      ...user,
      password: await bcrypt.hash('pass', 4),
    });
    await expect(service.validateUser(' Developer@Example.com ', 'pass')).resolves.toEqual(user);
    expect(users.findOneByEmailWithPassword).toHaveBeenCalledWith('developer@example.com');
    await expect(service.validateUser(user.email, 'wrong')).resolves.toBeNull();
  });

  it('creates a session and signs a session-bound token, preserving token aliases', async () => {
    sessions.create.mockResolvedValue({ sessionId: 'sid', refreshToken: 'refresh' });
    const response = await service.login(user, { ip: '127.0.0.1' });
    expect(sessions.create).toHaveBeenCalledWith(user.id, { ip: '127.0.0.1' });
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: user.id,
      sid: 'sid',
      email: user.email,
      roles: user.roles,
    });
    expect(response).toMatchObject({
      session_id: 'sid',
      access_token: 'signed-token',
      accessToken: 'signed-token',
      refresh_token: 'refresh',
      refreshToken: 'refresh',
    });
  });

  it('does not sign a token if session persistence fails', async () => {
    sessions.create.mockRejectedValue(new Error('database unavailable'));
    await expect(service.login(user)).rejects.toThrow('database unavailable');
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('refreshes using the same session and the current user roles', async () => {
    sessions.rotate.mockResolvedValue({
      sessionId: 'sid',
      userId: user.id,
      refreshToken: 'rotated',
    });
    const response = await service.refresh('old');
    expect(sessions.rotate).toHaveBeenCalledWith('old');
    expect(sessions.findActive).toHaveBeenCalledWith('sid', user.id);
    expect(response.refresh_token).toBe('rotated');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'sid', roles: user.roles }),
    );
  });

  it('rejects a deleted user or a session revoked after rotation', async () => {
    sessions.rotate.mockResolvedValue({
      sessionId: 'sid',
      userId: user.id,
      refreshToken: 'rotated',
    });
    users.findOneById.mockResolvedValue(null);
    await expect(service.refresh('old')).rejects.toThrow(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
    sessions.findActive.mockRejectedValue(new UnauthorizedException());
    await expect(service.refresh('old')).rejects.toThrow(UnauthorizedException);
  });

  it('propagates invalid refresh and database errors without issuing tokens', async () => {
    sessions.rotate.mockRejectedValue(new UnauthorizedException());
    await expect(service.refresh('bad')).rejects.toThrow(UnauthorizedException);
    sessions.rotate.mockRejectedValue(new Error('database unavailable'));
    await expect(service.refresh('bad')).rejects.toThrow('database unavailable');
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('logs out only the authenticated session', async () => {
    await expect(service.logout(user.id, 'sid')).resolves.toEqual({
      message: 'Logged out successfully',
    });
    expect(sessions.revoke).toHaveBeenCalledWith('sid', user.id);
  });
});
