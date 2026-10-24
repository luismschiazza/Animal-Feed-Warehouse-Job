import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import {
  SessionLimitConfigurationService,
  validateSessionLimitUpdate,
} from './session-limit-configuration.service';
import { SessionSerializationService } from './session-serialization.service';

describe('Session limit configuration', () => {
  it.each([
    null,
    {},
    [],
    { limit: 0, expectedVersion: 0 },
    { limit: 101, expectedVersion: 0 },
    { limit: 1.5, expectedVersion: 0 },
    { limit: '3', expectedVersion: 0 },
    { limit: 3, expectedVersion: -1 },
    { limit: 3, expectedVersion: 0.5 },
    { limit: 3, expectedVersion: '0' },
    { limit: 3 },
    { limit: 3, expectedVersion: 0, organizationId: 'forged' },
    { limit: 3, expectedVersion: 0, applicationId: 'cta' },
    { limit: 3, expectedVersion: 2147483647 },
  ])('rejects invalid/forged configuration %j', (value) => {
    expect(() => validateSessionLimitUpdate(value)).toThrow(BadRequestException);
  });
  it.each([1, 3, 100])('accepts a bounded integer %s', (limit) => {
    expect(() => validateSessionLimitUpdate({ limit, expectedVersion: 0 })).not.toThrow();
  });
  const actor = {
    id: new Types.ObjectId().toString(),
    organizationId: new Types.ObjectId().toString(),
    membershipId: new Types.ObjectId().toString(),
    sessionId: 'server-verified',
    status: AccountStatus.ACTIVE,
    roles: [Role.SYSTEM_ADMIN],
  };
  function fixture(row?: object) {
    const exec = jest.fn().mockResolvedValue(row ?? null);
    const query = {
      exec,
      lean: jest.fn().mockReturnThis(),
      readConcern: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      read: jest.fn().mockReturnThis(),
    };
    const read = query.read;
    const sort = jest.fn().mockReturnValue(query);
    const model = { findOne: jest.fn().mockReturnValue({ sort }), create: jest.fn() };
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
      result: jest.fn().mockReturnValue('error'),
    };
    const authorization = { authorize: jest.fn().mockResolvedValue({ actor }) };
    const service = new SessionLimitConfigurationService(
      model as any,
      authorization as any,
      audit as any,
      { get: () => ({ requestId: 'server-request' }) } as any,
      { run: (work) => work(undefined, new Date(), 1) } as unknown as SessionSerializationService,
    );
    return { service, model, audit, authorization, read };
  }
  it('returns default version 0/limit 3 without writing and reads primary', async () => {
    const f = fixture();
    expect(await f.service.read(actor)).toMatchObject({
      limit: 3,
      version: 0,
      organizationId: actor.organizationId,
      applicationId: 'animal-feed-warehouse',
    });
    expect(f.model.create).not.toHaveBeenCalled();
    expect(f.read).toHaveBeenCalledWith('primary');
  });
  it('does not fall back when stored configuration is malformed', async () => {
    await expect(fixture({ limit: 0, version: 1 }).service.read(actor)).rejects.toThrow(
      'unavailable',
    );
  });
  it('rejects stale versions before inserting and maps duplicate successors to conflict', async () => {
    const f = fixture({ limit: 5, version: 1 });
    await expect(f.service.update(actor, { limit: 2, expectedVersion: 0 })).rejects.toThrow(
      ConflictException,
    );
    expect(f.model.create).not.toHaveBeenCalled();
    f.model.create.mockRejectedValue({ code: 11000 });
    await expect(f.service.update(actor, { limit: 2, expectedVersion: 1 })).rejects.toThrow(
      ConflictException,
    );
  });
  it('writes a single immutable effect/receipt using verified actor and majority/journal', async () => {
    const f = fixture();
    const _id = new Types.ObjectId();
    f.model.create.mockResolvedValue([{ _id, limit: 2, version: 1 }]);
    await expect(f.service.update(actor, { limit: 2, expectedVersion: 0 })).resolves.toMatchObject({
      limit: 2,
      version: 1,
    });
    expect(f.model.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          previousLimit: 3,
          limit: 2,
          version: 1,
          actorUserId: new Types.ObjectId(actor.id),
          membershipId: new Types.ObjectId(actor.membershipId),
          requestId: 'server-request',
        }),
      ],
      { session: undefined },
    );
  });
});
