import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Model, Types } from 'mongoose';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { ListSessionsDto } from '../dtos/validation/list-sessions.dto';
import { AuthSession } from '../schemas/auth-session.schema';
import { generateRefreshToken } from '../tokens/refresh-token';
import { AuthSessionsService } from './auth-sessions.service';
import { AuthService } from './auth.service';
import { SessionManagementService } from './session-management.service';

describe('Session listing — mocked persistence, not proof of MongoDB isolation', () => {
  const userId = new Types.ObjectId().toString();
  const current = generateRefreshToken().sessionId;
  let service: AuthSessionsService;
  let db: { find: jest.Mock };
  let query: Record<string, jest.Mock>;

  const row = (sessionId = current) => ({
    _id: new Types.ObjectId(),
    sessionId,
    organizationId: new Types.ObjectId(),
    userAgent: 'Browser',
    ip: '127.0.0.1',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    currentTokenId: 'private-token-id',
    currentTokenHash: 'private-hash',
    consumedTokens: [{ tokenId: 'private-history-id' }],
    password: 'unexpected-field',
  });

  beforeEach(() => {
    query = Object.fromEntries(
      ['select', 'sort', 'limit', 'lean'].map((key) => [
        key,
        jest.fn().mockImplementation(() => query),
      ]),
    );
    query.exec = jest.fn().mockResolvedValue([]);
    db = { find: jest.fn().mockReturnValue(query) };
    service = new AuthSessionsService(db as unknown as Model<AuthSession>);
  });

  it('always filters owner, revocation and absolute expiry before projecting public fields', async () => {
    await service.listOwnedActive(userId, current);
    expect(db.find).toHaveBeenCalledWith({
      userId: new Types.ObjectId(userId),
      revokedAt: null,
      expiresAt: { $gt: expect.any(Date) },
    });
    expect(query.select).toHaveBeenCalledWith(
      '_id sessionId organizationId userAgent ip createdAt lastUsedAt expiresAt',
    );
    expect(query.sort).toHaveBeenCalledWith({ _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(26);
  });

  it('maps an explicit allowlist even if a database mock returns extra credentials', async () => {
    const first = row(),
      second = row(generateRefreshToken().sessionId);
    second.organizationId = null;
    query.exec.mockResolvedValue([first, second]);
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
    expect(Object.keys(result.items[0])).not.toContain('_id');
    expect(JSON.stringify(result)).not.toMatch(/private-|password|consumedTokens|currentToken/);
    expect(result.nextCursor).toBeNull();
  });

  it('bounds each page and keeps ownership filters when using an untrusted cursor', async () => {
    const first = row(),
      cursor = new Types.ObjectId().toString();
    query.exec.mockResolvedValue([first, row()]);
    const result = await service.listOwnedActive(userId, current, 1, cursor);
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(first._id.toString());
    expect(db.find).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: new Types.ObjectId(userId),
        _id: { $lt: new Types.ObjectId(cursor) },
      }),
    );
    expect(query.limit).toHaveBeenCalledWith(2);
  });

  it.each([0, -1, 101, 1.5, NaN, '25'])(
    'rejects invalid limit %s without querying',
    async (limit) => {
      await expect(service.listOwnedActive(userId, current, limit as number)).rejects.toThrow(
        BadRequestException,
      );
      expect(db.find).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid identities, session IDs and cursors before querying', async () => {
    await expect(service.listOwnedActive('invalid', current)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.listOwnedActive(userId, 'invalid')).rejects.toThrow(UnauthorizedException);
    await expect(service.listOwnedActive(userId, current, 25, 'invalid')).rejects.toThrow(
      BadRequestException,
    );
    expect(db.find).not.toHaveBeenCalled();
  });
});

describe('SessionManagementService authentication boundary', () => {
  const actor = {
    id: new Types.ObjectId().toString(),
    sessionId: generateRefreshToken().sessionId,
    roles: [Role.CUSTOMER],
    status: AccountStatus.ACTIVE,
  };
  let auth: { validateSession: jest.Mock };
  let sessions: { listOwnedActive: jest.Mock };
  let service: SessionManagementService;
  beforeEach(() => {
    auth = { validateSession: jest.fn().mockResolvedValue({ id: actor.id }) };
    sessions = { listOwnedActive: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    service = new SessionManagementService(
      auth as unknown as AuthService,
      sessions as unknown as AuthSessionsService,
    );
  });
  it('revalidates the caller and uses server identity rather than an optional client user ID', async () => {
    await service.listOwn(actor, 10);
    expect(auth.validateSession).toHaveBeenCalledWith(actor.id, actor.sessionId);
    expect(sessions.listOwnedActive).toHaveBeenCalledWith(actor.id, actor.sessionId, 10, undefined);
  });
  it('does not query sessions after account/session/membership validation fails', async () => {
    auth.validateSession.mockRejectedValue(new UnauthorizedException());
    await expect(service.listOwn(actor)).rejects.toThrow(UnauthorizedException);
    expect(sessions.listOwnedActive).not.toHaveBeenCalled();
  });
  it('rejects forged organization context', async () => {
    await expect(
      service.listOwn({ ...actor, organizationId: new Types.ObjectId().toString() }),
    ).rejects.toThrow(UnauthorizedException);
    expect(sessions.listOwnedActive).not.toHaveBeenCalled();
  });
  it('rejects missing identity before authentication or database calls', async () => {
    await expect(service.listOwn(undefined)).rejects.toThrow(UnauthorizedException);
    expect(auth.validateSession).not.toHaveBeenCalled();
    expect(sessions.listOwnedActive).not.toHaveBeenCalled();
  });
});

describe('Session pagination DTO', () => {
  it('accepts numeric HTTP limit/default and rejects caller-chosen ownership fields', async () => {
    const dto = plainToInstance(ListSessionsDto, { limit: '10' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(10);
    expect(plainToInstance(ListSessionsDto, {}).limit).toBe(25);
    const forged = plainToInstance(ListSessionsDto, { userId: new Types.ObjectId().toString() });
    expect(
      await validate(forged, { whitelist: true, forbidNonWhitelisted: true }),
    ).not.toHaveLength(0);
  });
});
