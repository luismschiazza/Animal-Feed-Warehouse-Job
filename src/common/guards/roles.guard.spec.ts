import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  const contextWithUser = (user?: { roles?: Role[] }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as never;

  beforeEach(() => jest.clearAllMocks());

  it('allows a route without role requirements', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWithUser())).toBe(true);
  });

  it('allows a user with one of the required business roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.MANAGER, Role.SYSTEM_ADMIN]);

    expect(
      guard.canActivate(contextWithUser({ roles: [Role.INVENTORY_OPERATOR, Role.MANAGER] })),
    ).toBe(true);
  });

  it('denies a user without a required business role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.FINANCIAL_ANALYST]);

    expect(() => guard.canActivate(contextWithUser({ roles: [Role.SALES_ASSOCIATE] }))).toThrow(
      ForbiddenException,
    );
  });

  it('denies a request without authenticated roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.SYSTEM_ADMIN]);

    expect(() => guard.canActivate(contextWithUser())).toThrow(ForbiddenException);
  });
});
