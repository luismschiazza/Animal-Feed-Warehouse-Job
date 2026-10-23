import { createConnection } from 'mongoose';
import { verifyAuditIndexes } from '@/common/audit/audit-indexes';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';
import {
  SessionSerialization,
  SessionSerializationSchema,
} from '@/features/auth/schemas/session-serialization.schema';

// Explicit operator-only URI; no dotenv, MONGO_URL fallback, account or session creation.
async function main() {
  if (!process.env.SESSION_ADMISSION_MONGO_URL) throw new Error('Explicit operator URI required');
  const connection = await createConnection(process.env.SESSION_ADMISSION_MONGO_URL, {
    autoCreate: false,
    autoIndex: false,
  }).asPromise();
  try {
    const hello = await connection.db.admin().command({ hello: 1 });
    if (typeof hello.setName !== 'string') throw new Error('Replica set required');
    const model = connection.model(SessionSerialization.name, SessionSerializationSchema);
    await model.createCollection();
    await verifyAuditIndexes(model);
    if (!(await model.exists({ _id: SESSION_LIMIT_APPLICATION }))) {
      // Never reset ordering after metadata loss: restore a coherent backup/manual recovery.
      const sequencedSession = await connection.db
        .collection('auth_sessions')
        .findOne({ admissionSequence: { $exists: true } });
      const sequencedRule = await connection.db
        .collection('auth_session_revocations')
        .findOne({ revokedThroughSequence: { $exists: true } });
      if (sequencedSession || sequencedRule)
        throw new Error('Existing ordered state requires manual recovery');
      try {
        await model.create(
          [{ _id: SESSION_LIMIT_APPLICATION, sequence: 0, serverNow: hello.localTime }],
          { writeConcern: { w: 'majority', j: true } },
        );
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    const row = await model.findById(SESSION_LIMIT_APPLICATION).lean().exec();
    if (
      !row ||
      !Number.isSafeInteger(row.sequence) ||
      row.sequence < 0 ||
      !(row.serverNow instanceof Date) ||
      !Number.isFinite(row.serverNow.getTime())
    )
      throw new Error('Invalid serialization metadata; manual inspection required');
    console.info('Session serialization initialized; no session, policy or account created.');
  } finally {
    await connection.close();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error('Session admission initialization failed; no automatic repair performed.');
    process.exitCode = 1;
  });
