import { createConnection } from 'mongoose';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

// Explicit disposable URI only. No application dotenv/MONGO_URL is read by this harness.
async function main() {
  const uri = process.env.SESSIONS_TEST_MONGO_URL;
  if (!uri) throw new Error('Explicit disposable URI required');
  const selected = new URL(uri);
  if (selected.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(selected.hostname))
    throw new Error('Dedicated local server required');
  const database = `sessions_test_init_${randomUUID().replace(/-/g, '')}`;
  selected.pathname = '/' + database;
  const db = await createConnection(selected.toString(), {
    autoIndex: false,
    autoCreate: false,
  }).asPromise();
  const cli = async (value: string, success: boolean) => {
    let failed = false;
    try {
      await promisify(execFile)(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          'src/commands/initialize-session-admission.script.ts',
        ],
        {
          env: {
            ...process.env,
            SESSION_ADMISSION_MONGO_URL: value,
            MONGO_URL: selected.toString(),
          },
          timeout: 30_000,
        },
      );
    } catch {
      failed = true;
    }
    if (failed === success) throw new Error('Unexpected admission initializer result');
  };
  try {
    await cli('', false);
    if ((await db.db.listCollections().toArray()).length) throw new Error('Fallback URI was used');
    await cli(selected.toString(), true);
    const fence = db.db.collection('session_serialization');
    if ((await fence.countDocuments()) !== 1) throw new Error('Missing singleton');
    if ((await db.db.listCollections().toArray()).length !== 1)
      throw new Error('Unexpected account/policy/session collection');
    await fence.updateOne({ _id: 'animal-feed-warehouse' } as any, { $set: { sequence: 7 } });
    await cli(selected.toString(), true);
    if ((await fence.findOne()).sequence !== 7) throw new Error('Initializer reset ordering');
    await fence.updateOne({ _id: 'animal-feed-warehouse' } as any, { $set: { sequence: 1.5 } });
    await cli(selected.toString(), false);
    if ((await fence.findOne()).sequence !== 1.5)
      throw new Error('Initializer repaired corruption');
    await fence.deleteMany({});
    await db.db.collection('auth_session_revocations').insertOne({ revokedThroughSequence: 7 });
    await cli(selected.toString(), false);
    if ((await fence.countDocuments()) !== 0)
      throw new Error('Initializer reset lost coordination state');
    console.info(
      'PASS isolated admission CLI: no fallback/accounts/policies; repeat preserves ordering; corruption and unsafe reinitialization refused.',
    );
  } finally {
    if (db.name === database) await db.dropDatabase();
    await db.close();
  }
}
void main().catch(() => {
  console.error('FAIL disposable admission CLI smoke');
  process.exitCode = 1;
});
