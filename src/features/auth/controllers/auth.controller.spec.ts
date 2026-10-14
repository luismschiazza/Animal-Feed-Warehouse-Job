import { Test } from '@nestjs/testing';
import { AuthService } from '@/features/auth/services/auth.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  const auth = { login: jest.fn(), refresh: jest.fn(), logout: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();
    controller = module.get(AuthController);
  });
  it('passes the server-observed metadata on login', async () => {
    const user = { id: 'id' };
    await controller.login(
      { email: 'luis@example.com', password: 'password' },
      { user, ip: '127.0.0.1', headers: { 'user-agent': 'Test device' } },
    );
    expect(auth.login).toHaveBeenCalledWith(
      user,
      { ip: '127.0.0.1', userAgent: 'Test device' },
      undefined,
    );
  });
  it('forwards refresh and logs out the authenticated session', async () => {
    await controller.refresh({ refreshToken: 'token' });
    expect(auth.refresh).toHaveBeenCalledWith('token');
    await controller.logout({ user: { id: 'id', sessionId: 'sid' } });
    expect(auth.logout).toHaveBeenCalledWith('id', 'sid');
  });
});
