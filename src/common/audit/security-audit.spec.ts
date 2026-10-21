import {
  BadRequestException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { SessionRevocationSchema } from '@/features/auth/schemas/session-revocation.schema';
import { generateRefreshToken } from '@/features/auth/tokens/refresh-token';
import { MailService } from '@/features/mail/services/mail.service';
import { UserListener } from '@/features/users/listeners/user.listener';
import { MongooseConfig } from '@/insfrastructure/database/configs/mongoose.config';
import { PolicyAction, PolicyResource } from '../authorization/policy.types';
import { Role } from '../enums/role.enum';
import { AuditContext } from './audit-context.service';
import { AuditEvent, SecurityAuditRecord, SecurityAuditSchema } from './security-audit.schema';
import { SecurityAuditService } from './security-audit.service';

describe('Security audit — boundaries and redaction', () => {
  const actor = {
    id: new Types.ObjectId().toString(),
    sessionId: generateRefreshToken().sessionId,
    organizationId: new Types.ObjectId().toString(),
    roles: [Role.SYSTEM_ADMIN],
  };
  let db: { create: jest.Mock; init: jest.Mock; aggregate: jest.Mock },
    context: AuditContext,
    service: SecurityAuditService;
  beforeEach(() => {
    db = { create: jest.fn().mockResolvedValue([]), init: jest.fn(), aggregate: jest.fn() };
    context = new AuditContext();
    service = new SecurityAuditService(db as unknown as Model<SecurityAuditRecord>, context);
  });
  it('persists only allowlisted fields with majority/journal; never request/actor extras', async () => {
    await context.run({ method: 'POST', ip: '127.0.0.1' }, () =>
      service.record(AuditEvent.LOGIN, 'allowed', 'auth', {
        ...actor,
        password: 'NeverLogThis',
        access_token: 'NeverLogJWT',
      } as typeof actor),
    );
    const [[row], options] = db.create.mock.calls[0];
    expect(options).toEqual({ writeConcern: { w: 'majority', j: true } });
    expect(row.actorUserId).toEqual(new Types.ObjectId(actor.id));
    expect(row.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(row).toMatchObject({ method: 'POST', ip: '127.0.0.1', roles: [Role.SYSTEM_ADMIN] });
    expect(JSON.stringify(row)).not.toMatch(/NeverLog|password|access_token/);
  });
  it('does not persist arbitrary policy strings or cross-context own-session targets', async () => {
    await service.record(AuditEvent.AUTHORIZATION, 'denied', 'service', actor, {
      resource: 'a secret',
      action: 'a token',
      targetId: 'password',
    });
    expect(db.create.mock.calls[0][0][0]).toMatchObject({
      resource: undefined,
      action: undefined,
      targetId: undefined,
    });
    await service.record(AuditEvent.AUTHORIZATION, 'allowed', 'guard', actor, {
      resource: PolicyResource.SESSION,
      action: PolicyAction.REVOKE,
      targetId: generateRefreshToken().sessionId,
    });
    expect(db.create.mock.calls[1][0][0].targetId).toBeUndefined();
  });
  it('isolates concurrent AsyncLocalStorage contexts and discards invalid IP/header-like metadata', async () => {
    await Promise.all(
      ['GET', 'POST'].map((method) =>
        context.run({ method, ip: 'secret\r\nforged' }, async () => {
          const before = context.get();
          await Promise.resolve();
          expect(context.get()).toEqual(before);
          await service.record(AuditEvent.AUTHENTICATION, 'denied', 'guard');
        }),
      ),
    );
    const rows = db.create.mock.calls.map((call) => call[0][0]);
    expect(new Set(rows.map((row) => row.requestId)).size).toBe(2);
    expect(rows.every((row) => row.ip === undefined)).toBe(true);
  });
  it('fails with generic unavailable, not original database diagnostics', async () => {
    db.create.mockRejectedValue(new Error('mongodb://operator:secret@host token=raw'));
    await expect(service.record(AuditEvent.LOGIN, 'allowed', 'auth', actor)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(service.record(AuditEvent.LOGIN, 'allowed', 'auth', actor)).rejects.not.toThrow(
      'mongodb',
    );
    expect(service.result(new ForbiddenException())).toBe('denied');
    expect(service.result(new Error('raw'))).toBe('error');
  });
  it('rejects malformed pagination/scopes before reading', async () => {
    for (const limit of [0, 101, 1.5, NaN])
      await expect(service.page({ kind: 'user', id: actor.id }, limit)).rejects.toThrow(
        BadRequestException,
      );
    await expect(service.page({ kind: 'user', id: 'bad' })).rejects.toThrow(BadRequestException);
    await expect(service.page({ kind: 'anonymous' }, 25, 'bad.cursor')).rejects.toThrow(
      BadRequestException,
    );
    expect(db.aggregate).not.toHaveBeenCalled();
  });
  it('declares no TTL, no automatic audit DDL, and marks persisted event fields immutable', () => {
    for (const schema of [SecurityAuditSchema, SessionRevocationSchema]) {
      expect(schema.options.autoCreate).toBe(false);
      expect(schema.options.autoIndex).toBe(false);
    }
    expect(
      SecurityAuditSchema.indexes().some(([, options]) => options.expireAfterSeconds !== undefined),
    ).toBe(false);
    for (const field of [
      'event',
      'occurredAt',
      'actorUserId',
      'sessionId',
      'organizationId',
      'requestId',
    ])
      expect(SecurityAuditSchema.path(field).options.immutable).toBe(true);
  });
  it('forces primary reads for application security metadata even with a secondary URI', async () => {
    const options = await MongooseConfig({
      get: () => 'mongodb://localhost/test?readPreference=secondary',
    } as unknown as ConfigService);
    expect(options.readPreference).toBe('primary');
  });
  it('removes recipient/subject/SMTP errors and identity PII from auxiliary logs', async () => {
    const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const oldName = process.env.MAIL_FROM,
      oldEmail = process.env.MAIL_FROM_MAIL;
    process.env.MAIL_FROM = 'Test';
    process.env.MAIL_FROM_MAIL = 'test@example.invalid';
    try {
      new UserListener().handleUserCreated({
        email: 'private@example.invalid',
        roles: [Role.CUSTOMER],
      } as any);
      const mail = new MailService(
        {
          getTransporter: () => ({
            sendMail: () => Promise.reject(new Error('SMTP secret and private@example.invalid')),
          }),
        } as any,
        { render: async () => '<p>private</p>' } as any,
      );
      await expect(
        mail.send({ to: 'private@example.invalid', subject: 'private subject', template: 'test' }),
      ).rejects.toThrow('Email delivery failed');
      expect(JSON.stringify([logs.mock.calls, errors.mock.calls])).not.toMatch(
        /private|SMTP secret/,
      );
    } finally {
      if (oldName === undefined) delete process.env.MAIL_FROM;
      else process.env.MAIL_FROM = oldName;
      if (oldEmail === undefined) delete process.env.MAIL_FROM_MAIL;
      else process.env.MAIL_FROM_MAIL = oldEmail;
      logs.mockRestore();
      errors.mockRestore();
    }
  });
});
