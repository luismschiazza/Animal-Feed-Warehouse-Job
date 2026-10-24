import { createConnection } from 'mongoose';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';

// Only invoked by the disposable integration suite. Deliberately killed BEFORE commit.
async function main() {
  const uri = process.env.SESSIONS_TEST_MONGO_URL,
    database = process.env.ADMISSION_CRASH_DATABASE;
  if (!uri || !/^sessions_test_atomic_[a-f0-9]{32}$/.test(database ?? ''))
    throw new Error('Disposable target required');
  const connection = await createConnection(uri, {
    dbName: database,
    autoCreate: false,
    autoIndex: false,
  }).asPromise();
  const session = await connection.startSession();
  session.startTransaction();
  await connection.db
    .collection('session_serialization')
    .updateOne({ _id: SESSION_LIMIT_APPLICATION } as any, { $inc: { sequence: 1 } }, { session });
  await connection.db
    .collection('auth_sessions')
    .insertOne({ sessionId: 'uncommitted-crash-marker' }, { session });
  console.info('transaction-held');
  await new Promise(() => {
    setInterval(() => undefined, 1000);
  });
}
void main().catch(() => {
  console.error('Disposable crash worker failed');
  process.exit(1);
});
