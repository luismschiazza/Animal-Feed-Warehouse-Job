import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Model, Types } from 'mongoose';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { PolicyEngine } from '@/common/authorization/policy-engine.service';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { ListSessionsDto } from '../dtos/validation/list-sessions.dto';
import { AuthSession } from '../schemas/auth-session.schema';
import { generateRefreshToken } from '../tokens/refresh-token';
import { AuthSessionsService } from './auth-sessions.service';
import { AuthService } from './auth.service';
import { SessionManagementService } from './session-management.service';
import { SessionRevocationsService } from './session-revocations.service';

describe('Session listing — mocked aggregate, not proof of MongoDB isolation', () => {
  const userId = new Types.ObjectId().toString(),
    current = generateRefreshToken().sessionId;
  let service: AuthSessionsService, aggregate: jest.Mock, execute: jest.Mock;
  const row = (sessionId = current) => ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(userId),
    sessionId,
    organizationId: new Types.ObjectId(),
    userAgent: 'Browser',
    ip: '127.0.0.1',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    currentTokenId: 'private-token-id',
    currentTokenHash: 'private-hash',
    consumedTokens: [],
    password: 'unexpected',
  });
  beforeEach(() => {
    execute = jest.fn().mockResolvedValue([]);
    const query = { exec: execute, read: jest.fn().mockReturnThis() };
    aggregate = jest.fn().mockReturnValue(query);
    service = new AuthSessionsService(
      { aggregate } as unknown as Model<AuthSession>,
      { activeLookup: () => [] } as unknown as SessionRevocationsService,
      { assertClock: async () => undefined } as any,
      undefined,
      undefined,
    );
  });
  it('always filters owner/expiry and projects only public metadata before lookup/pagination', async () => {
    await service.listOwnedActive(userId, current);
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline[0].$match).toEqual({
      userId: new Types.ObjectId(userId),
      revokedAt: null,
      $expr: { $gt: ['$expiresAt', '$$NOW'] },
      createdAt: { $type: 'date' },
    });
    expect(pipeline[1]).toEqual({ $sort: { _id: -1 } });
    expect(Object.keys(pipeline[2].$project).sort()).toEqual(
      [
        '_id',
        'admissionSequence',
        'userId',
        'sessionId',
        'organizationId',
        'userAgent',
        'ip',
        'createdAt',
        'lastUsedAt',
        'expiresAt',
      ].sort(),
    );
    expect(pipeline[pipeline.length - 1]).toEqual({ $limit: 26 });
  });
  it('maps an explicit allowlist even if a database mock returns extra credentials', async () => {
    const first = row(),
      second = { ...row(generateRefreshToken().sessionId), organizationId: null };
    execute.mockResolvedValue([first, second]);
    const result = await service.listOwnedActive(userId, current);
    expect(result.items[0]).toEqual({
      sessionId: current,
      organizationId: first.organizationId.toString(),
      current: true,
      userAgent: first.userAgent,
      ip: first.ip,
      createdAt: first.createdAt,
      lastRefreshedAt: first.lastUsedAt,
      expiresAt: first.expiresAt,
    });
    expect(result.items[1]).toMatchObject({ current: false, organizationId: null });
    expect(JSON.stringify(result)).not.toMatch(/private-|password|consumedTokens|currentToken/);
    expect(result.nextCursor).toBeNull();
  });
  it('keeps ownership filters on later pages and bounds page size', async () => {
    const first = row(),
      cursor = new Types.ObjectId().toString();
    execute.mockResolvedValue([first, row()]);
    const result = await service.listOwnedActive(userId, current, 1, cursor);
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(first._id.toString());
    expect(aggregate.mock.calls[0][0][0].$match).toMatchObject({
      userId: new Types.ObjectId(userId),
      _id: { $lt: new Types.ObjectId(cursor) },
    });
  });
  it.each([0, -1, 101, 1.5, NaN, '25'])(
    'rejects invalid limit %s before querying',
    async (limit) => {
      await expect(service.listOwnedActive(userId, current, limit as number)).rejects.toThrow(
        BadRequestException,
      );
      expect(aggregate).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid IDs/current SID/cursors before querying', async () => {
    await expect(service.listOwnedActive('invalid', current)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.listOwnedActive(userId, 'invalid')).rejects.toThrow(UnauthorizedException);
    await expect(service.listOwnedActive(userId, current, 25, 'invalid')).rejects.toThrow(
      BadRequestException,
    );
    expect(aggregate).not.toHaveBeenCalled();
  });
});

describe('SessionManagementService — revalidation and policy boundary', () => {
  const actor = {
    id: new Types.ObjectId().toString(),
    sessionId: generateRefreshToken().sessionId,
    roles: [Role.CUSTOMER],
    status: AccountStatus.ACTIVE,
  };
  let auth: { validateSession: jest.Mock },
    sessions: Record<string, jest.Mock>,
    rules: Record<string, jest.Mock>,
    service: SessionManagementService;
  beforeEach(() => {
    auth = { validateSession: jest.fn().mockResolvedValue(actor) };
    sessions = {
      listOwnedActive: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      findTarget: jest.fn(),
      listOrganizationActive: jest.fn(),
    };
    rules = { single: jest.fn(), ownAll: jest.fn(), organizationAll: jest.fn() };
    service = new SessionManagementService(
      auth as unknown as AuthService,
      sessions as unknown as AuthSessionsService,
      rules as unknown as SessionRevocationsService,
      new PolicyEngine(),
      { record: jest.fn(), result: () => 'denied' } as unknown as SecurityAuditService,
    );
  });
  it('revalidates server identity and applies owner-scoped listing', async () => {
    await service.listOwn(actor, 10);
    expect(auth.validateSession).toHaveBeenCalledWith(actor.id, actor.sessionId);
    expect(sessions.listOwnedActive).toHaveBeenCalledWith(actor.id, actor.sessionId, 10, undefined);
  });
  it('does not query after invalid session/account/membership or organization claims', async () => {
    auth.validateSession.mockRejectedValueOnce(new UnauthorizedException());
    await expect(service.listOwn(actor)).rejects.toThrow(UnauthorizedException);
    await expect(
      service.listOwn({ ...actor, organizationId: new Types.ObjectId().toString() }),
    ).rejects.toThrow(UnauthorizedException);
    expect(sessions.listOwnedActive).not.toHaveBeenCalled();
  });
  it('denies missing identity before any authentication/query', async () => {
    await expect(service.listOwn(undefined)).rejects.toThrow(UnauthorizedException);
    expect(auth.validateSession).not.toHaveBeenCalled();
  });
  it('does not trust forged administrator roles even in direct service calls', async () => {
    await expect(
      service.listOrganization({ ...actor, roles: [Role.SYSTEM_ADMIN] }),
    ).rejects.toThrow(ForbiddenException);
    expect(sessions.listOrganizationActive).not.toHaveBeenCalled();
    await expect(
      service.revokeOrganizationAll({ ...actor, roles: [Role.SYSTEM_ADMIN] }),
    ).rejects.toThrow(ForbiddenException);
    expect(rules.organizationAll).not.toHaveBeenCalled();
  });
  it('never writes an event when target ownership cannot be resolved', async () => {
    sessions.findTarget.mockRejectedValue(new ForbiddenException());
    const id = generateRefreshToken().sessionId;
    await expect(service.revokeOwn(actor, id)).rejects.toThrow();
    expect(sessions.findTarget).toHaveBeenCalledWith(id, { userId: actor.id });
    expect(rules.single).not.toHaveBeenCalled();
  });
  it('others uses the authenticated current SID, not a client exception', async () => {
    await service.revokeOwnAll(actor, true);
    expect(rules.ownAll).toHaveBeenCalledWith(
      expect.objectContaining({ id: actor.id, sessionId: actor.sessionId }),
      true,
    );
  });
});

describe('Session pagination DTO', () => {
  it('parses numeric HTTP limit and rejects caller-selected ownership fields', async () => {
    const dto = plainToInstance(ListSessionsDto, { limit: '10' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(10);
    expect(plainToInstance(ListSessionsDto, {}).limit).toBe(25);
    expect(
      await validate(
        plainToInstance(ListSessionsDto, { userId: new Types.ObjectId().toString() }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).not.toHaveLength(0);
  });
});
