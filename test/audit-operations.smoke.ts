import { Model, Schema, Types, createConnection } from 'mongoose';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import 'reflect-metadata';
import { AuditContext } from '../src/common/audit/audit-context.service';
import { verifyAuditIndexes } from '../src/common/audit/audit-indexes';
import {
  AuditEvent,
  SecurityAuditRecord,
  SecurityAuditSchema,
} from '../src/common/audit/security-audit.schema';
import { SecurityAuditService } from '../src/common/audit/security-audit.service';
import {
  SessionLimitRevision,
  SessionLimitRevisionSchema,
} from '../src/features/auth/schemas/session-limit-revision.schema';
import {
  SessionRevocation,
  SessionRevocationSchema,
} from '../src/features/auth/schemas/session-revocation.schema';
import {
  SessionSerialization,
  SessionSerializationSchema,
} from '../src/features/auth/schemas/session-serialization.schema';
import { SessionSerializationService } from '../src/features/auth/services/session-serialization.service';

async function mustDeny(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if ((error as { code?: number }).code === 13) return;
    throw error;
  }
  throw new Error('Unexpected database permission');
}
async function main() {
  const input = process.env.AUDIT_TEST_ADMIN_URL;
  if (!input) throw new Error('Explicit isolated authenticated MongoDB required');
  const selected = new URL(input);
  if (selected.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(selected.hostname))
    throw new Error('Dedicated local MongoDB required');
  const database = `audit_acl_test_${randomUUID().replace(/-/g, '')}`;
  selected.pathname = '/' + database;
  selected.searchParams.set('authSource', 'admin');
  const admin = await createConnection(selected.toString(), {
    autoCreate: false,
    autoIndex: false,
  }).asPromise();
  const collections = [
    'security_audit_events',
    'auth_session_revocations',
    'session_limit_revisions',
  ];
  const options = (schema: Schema) =>
    schema.clone().set('autoCreate', false).set('autoIndex', false);
  let writer: Awaited<ReturnType<typeof admin.asPromise>>, reader: typeof writer;
  try {
    const general = admin.model(SecurityAuditRecord.name, options(SecurityAuditSchema));
    const revocations = admin.model(SessionRevocation.name, options(SessionRevocationSchema));
    const limits = admin.model(SessionLimitRevision.name, options(SessionLimitRevisionSchema));
    for (const model of [general, revocations, limits] as Model<any>[]) {
      await model.createCollection();
      await model.createIndexes();
      await verifyAuditIndexes(model);
    }
    const fence = admin.model(SessionSerialization.name, options(SessionSerializationSchema));
    await fence.createCollection();
    await fence.create({ _id: 'animal-feed-warehouse', sequence: 0, serverNow: new Date() });
    const privileges = (actions: string[]) =>
      collections.map((collection) => ({ resource: { db: database, collection }, actions }));
    await admin.db.command({
      createRole: 'audit_writer',
      privileges: [
        ...privileges(['find', 'insert', 'listIndexes']),
        {
          resource: { db: database, collection: 'session_serialization' },
          actions: ['find', 'update', 'listIndexes'],
        },
      ],
      roles: [],
    });
    await admin.db.command({
      createRole: 'audit_reader',
      privileges: privileges(['find']),
      roles: [],
    });
    const password = randomBytes(32).toString('hex');
    for (const role of ['audit_writer', 'audit_reader'])
      await admin.db.command({ createUser: role, pwd: password, roles: [{ role, db: database }] });
    const asUser = (user: string) => {
      const uri = new URL(selected);
      uri.username = user;
      uri.password = password;
      uri.searchParams.set('authSource', database);
      return createConnection(uri.toString(), { autoCreate: false, autoIndex: false }).asPromise();
    };
    writer = await asUser('audit_writer');
    reader = await asUser('audit_reader');
    const writerModel = writer.model<SecurityAuditRecord>(
      SecurityAuditRecord.name,
      options(SecurityAuditSchema),
    );
    const store = new SecurityAuditService(writerModel, new AuditContext());
    await store.onModuleInit();
    const writerRevocations = writer.model<SessionRevocation>(
      SessionRevocation.name,
      options(SessionRevocationSchema),
    );
    await verifyAuditIndexes(writerRevocations);
    const account = new Types.ObjectId(),
      sid = randomUUID();
    await writerRevocations.create({
      scope: 'session',
      action: 'revoke_session',
      initiator: 'user',
      actorUserId: account,
      actorSessionId: sid,
      targetUserId: account,
      targetSessionId: sid,
      occurredAt: new Date(),
    });
    const configuration = writer.model<SessionLimitRevision>(
      SessionLimitRevision.name,
      options(SessionLimitRevisionSchema),
    );
    await verifyAuditIndexes(configuration);
    await configuration.create({
      applicationId: 'animal-feed-warehouse',
      organizationId: new Types.ObjectId(),
      version: 1,
      limit: 3,
      previousLimit: 3,
      actorUserId: account,
      membershipId: new Types.ObjectId(),
      roles: ['SYSTEM_ADMIN'],
      requestId: randomUUID(),
      occurredAt: new Date(),
    });
    if ((await configuration.findOne().read('primary')).limit !== 3)
      throw new Error('Restricted configuration read failed');
    await mustDeny(() =>
      configuration.collection.createIndex({ occurredAt: 1 }, { expireAfterSeconds: 1 }),
    );
    const runtimeFence = writer.model<SessionSerialization>(
      SessionSerialization.name,
      options(SessionSerializationSchema),
    );
    const coordinator = new SessionSerializationService(runtimeFence);
    await coordinator.onModuleInit();
    const previous = await writerModel.countDocuments();
    try {
      await coordinator.run(async (session) => {
        await store.record(
          AuditEvent.SESSION_ADMISSION,
          'allowed',
          'service',
          undefined,
          undefined,
          session,
        );
        throw new Error('Deliberate transactional abort');
      });
      throw new Error('Expected transaction abort');
    } catch (error) {
      if ((error as Error).message !== 'Session coordination unavailable') throw error;
    }
    if ((await writerModel.countDocuments()) !== previous)
      throw new Error('Audit transaction did not roll back');
    await coordinator.run(async (session) => {
      const row = await configuration.findOne().session(session).lean();
      await configuration.create([{ ...row, _id: new Types.ObjectId(), version: 2 }], { session });
    });
    await mustDeny(() => runtimeFence.collection.insertOne({ _id: 'forbidden' } as any));
    await mustDeny(() => runtimeFence.collection.deleteMany({}));
    await mustDeny(() =>
      runtimeFence.collection.createIndex({ serverNow: 1 }, { expireAfterSeconds: 1 }),
    );
    await store.record(AuditEvent.LOGIN, 'denied', 'auth');
    // A restricted writer can append/read, but cannot erase history or add a destructive TTL.
    await mustDeny(() => writerModel.collection.updateOne({}, { $set: { result: 'allowed' } }));
    await mustDeny(() => writerModel.collection.deleteMany({}));
    await mustDeny(() =>
      writerModel.collection.createIndex({ occurredAt: 1 }, { expireAfterSeconds: 1 }),
    );
    await mustDeny(() => writer.db.dropCollection('security_audit_events'));
    for (const collection of collections) {
      await mustDeny(() => reader.db.collection(collection).insertOne({ forbidden: true }));
      await mustDeny(() => writer.db.collection(collection).deleteMany({}));
      await mustDeny(() =>
        writer.db.collection(collection).updateOne({}, { $set: { action: 'tampered' } }),
      );
    }
    const readerStore = new SecurityAuditService(
      reader.model<SecurityAuditRecord>(SecurityAuditRecord.name, options(SecurityAuditSchema)),
      new AuditContext(),
    );
    if ((await readerStore.page({ kind: 'user', id: account.toString() })).items.length !== 1)
      throw new Error('Restricted authoritative audit reader failed');
    if ((await readerStore.page({ kind: 'anonymous' })).items.length !== 1)
      throw new Error('Restricted audit reader failed');
    const directory = await mkdtemp(join(tmpdir(), 'audit-cli-acl-'));
    try {
      const readerUri = new URL(selected);
      readerUri.username = 'audit_reader';
      readerUri.password = password;
      readerUri.searchParams.set('authSource', database);
      const destination = join(directory, 'archive.jsonl');
      await promisify(execFile)(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          'src/commands/audit-export.script.ts',
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: 'test',
            AUDIT_MONGO_URL: readerUri.toString(),
            AUDIT_SCOPE: 'anonymous',
            AUDIT_EXPORT_PATH: destination,
          },
        },
      );
      const manifest = JSON.parse(await readFile(destination + '.manifest.json', 'utf8'));
      if (manifest.count !== 1) throw new Error('Read-only CLI export failed');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    console.info(
      'PASS authenticated MongoDB ACL and read-only export CLI: append/read allowed; update/delete/drop/TTL and reader insert denied.',
    );
  } finally {
    await writer?.close();
    await reader?.close();
    // Only generated audit_acl_test_* database/users/roles, never the supplied admin DB.
    if (admin.name === database) {
      await admin.db.command({ dropAllUsersFromDatabase: 1 });
      await admin.db.command({ dropAllRolesFromDatabase: 1 });
      await admin.dropDatabase();
    }
    await admin.close();
  }
}
main().catch(() => {
  console.error('FAIL isolated MongoDB audit ACL smoke');
  process.exitCode = 1;
});
