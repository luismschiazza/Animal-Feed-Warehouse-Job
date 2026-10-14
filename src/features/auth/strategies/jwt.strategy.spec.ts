import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@/common/enums/role.enum';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthService } from '../services/auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const validateSession = jest.fn();
  let strategy: JwtStrategy;
  beforeEach(() => {
    validateSession.mockReset();
    strategy = new JwtStrategy(
      { validateSession } as unknown as AuthService,
      new ConfigService({ JWT_SECRET: 'test-only-secret-for-session-validation' }),
    );
  });

  it('rejects legacy tokens without sid before any lookup', async () => {
    await expect(strategy.validate({ sub: 'id' } as JwtPayload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('uses current user roles and returns the session to the logout handler', async () => {
    validateSession.mockResolvedValue({
      id: 'id',
      name: 'Luis',
      email: 'luis@example.com',
      roles: [Role.CUSTOMER],
    });
    const result = await strategy.validate({
      sub: 'id',
      sid: 'sid',
      email: 'old@example.com',
      roles: [Role.SYSTEM_ADMIN],
    });
    expect(validateSession).toHaveBeenCalledWith('id', 'sid');
    expect(result).toMatchObject({ id: 'id', sessionId: 'sid', roles: [Role.CUSTOMER] });
  });

  it('rejects JWT organization mismatches instead of trusting claims', async () => {
    validateSession.mockResolvedValue({ id: 'id', roles: [Role.CUSTOMER], organizationId: 'A' });
    await expect(
      strategy.validate({ sub: 'id', sid: 'sid', email: '', roles: [], organizationId: 'B' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('fails closed on revocation or database unavailability', async () => {
    validateSession.mockRejectedValue(new UnauthorizedException());
    const payload = { sub: 'id', sid: 'sid', email: '', roles: [] };
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    validateSession.mockRejectedValue(new Error('database unavailable'));
    await expect(strategy.validate(payload)).rejects.toThrow('database unavailable');
  });
});
