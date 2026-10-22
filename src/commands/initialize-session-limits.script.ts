import { createConnection } from 'mongoose';
import { verifyAuditIndexes } from '@/common/audit/audit-indexes';
import {
  SessionLimitRevision,
  SessionLimitRevisionSchema,
} from '@/features/auth/schemas/session-limit-revision.schema';

// Operator-only, explicit URI. No dotenv, runtime MONGO_URL fallback, drop or repair.
async function main() {
  if (!process.env.SESSION_LIMITS_MONGO_URL) throw new Error('Explicit operator URI required');
  const connection = await createConnection(process.env.SESSION_LIMITS_MONGO_URL, {
    autoCreate: false,
    autoIndex: false,
  }).asPromise();
  try {
    const model = connection.model(SessionLimitRevision.name, SessionLimitRevisionSchema);
    await model.createCollection();
    await model.createIndexes();
    await verifyAuditIndexes(model);
    console.info(
      'Session limit configuration collection/index initialized; no policy values or accounts created.',
    );
  } finally {
    await connection.close();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      'Session limit initialization failed; operator review required. No automatic repair performed.',
    );
    process.exitCode = 1;
  });
