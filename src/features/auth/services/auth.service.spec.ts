import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Role } from '@/common/enums/role.enum';
import { UsersService } from '@/features/users/services/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findOneByEmailWithPassword: jest.fn(),
    findOneById: jest.fn(),
    findOneByIdWithRefreshTokenHash: jest.fn(),
    updateRefreshTokenHash: jest.fn(),
    clearRefreshTokenHash: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    decode: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('validates credentials and returns a user without password', async () => {
    const password = 'dev123456';
    const passwordHash = await bcrypt.hash(password, 4);

    mockUsersService.findOneByEmailWithPassword.mockResolvedValue({
      id: 'user-id',
      email: 'developer@example.com',
      name: 'Developer',
      password: passwordHash,
      roles: [Role.ADMIN],
    });

    const user = await service.validateUser(' Developer@Example.com ', password);

    expect(mockUsersService.findOneByEmailWithPassword).toHaveBeenCalledWith(
      'developer@example.com',
    );
    expect(user).toEqual({
      id: 'user-id',
      email: 'developer@example.com',
      name: 'Developer',
      roles: [Role.ADMIN],
    });
    expect(user).not.toHaveProperty('password');
  });

  it('signs access tokens with a stable subject id', async () => {
    mockJwtService.sign.mockReturnValue('signed-token');
    mockJwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });
    mockUsersService.updateRefreshTokenHash.mockResolvedValue({});

    const response = await service.login({
      id: 'user-id',
      email: 'developer@example.com',
      name: 'Developer',
      roles: [Role.ADMIN],
    });
    expect(response).toMatchObject({
      access_token: 'signed-token',
      accessToken: 'signed-token',
    });
    expect(response.refresh_token).toEqual(expect.any(String));
    expect(response.refreshToken).toBe(response.refresh_token);
    expect(mockUsersService.updateRefreshTokenHash).toHaveBeenCalledWith(
      'user-id',
      expect.any(String),
    );
    expect(mockJwtService.sign).toHaveBeenCalledWith({
      sub: 'user-id',
      email: 'developer@example.com',
      roles: [Role.ADMIN],
    });
  });

  it('refreshes and rotates tokens when the refresh token hash matches', async () => {
    mockJwtService.sign.mockReturnValue('new-access-token');
    mockJwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });
    mockUsersService.updateRefreshTokenHash.mockResolvedValue({});

    const refreshToken = `user-id.${Date.now() + 3600000}.refresh-token-value`;
    const refreshTokenHash = await bcrypt.hash(refreshToken, 4);
    mockUsersService.findOneByIdWithRefreshTokenHash.mockResolvedValue({
      id: 'user-id',
      email: 'developer@example.com',
      name: 'Developer',
      roles: [Role.ADMIN],
      refreshTokenHash,
    });

    const response = await service.refresh(refreshToken);

    expect(mockUsersService.findOneByIdWithRefreshTokenHash).toHaveBeenCalledWith('user-id');
    expect(response.access_token).toBe('new-access-token');
    expect(response.refresh_token).toEqual(expect.any(String));
    expect(response.refresh_token).not.toBe(refreshToken);
    expect(mockUsersService.updateRefreshTokenHash).toHaveBeenCalledTimes(1);
  });

  it('clears the stored refresh token hash on logout', async () => {
    mockUsersService.clearRefreshTokenHash.mockResolvedValue({});

    await expect(service.logout('user-id')).resolves.toEqual({
      message: 'Logged out successfully',
    });

    expect(mockUsersService.clearRefreshTokenHash).toHaveBeenCalledWith('user-id');
  });
});
