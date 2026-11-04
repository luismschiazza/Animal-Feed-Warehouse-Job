import { createConnection } from 'mongoose';
import {
  SessionReplacement,
  SessionReplacementSchema,
  verifyReplacementIndexes,
} from '@/features/auth/schemas/session-replacement.schema';

// Operator-only DDL, no dotenv/default URI/accounts/grants, no automatic index repair.
async function main() {
  if (!process.env.SESSION_REPLACEMENT_MONGO_URL) throw new Error('Explicit operator URI required');
  const connection = await createConnection(process.env.SESSION_REPLACEMENT_MONGO_URL, {
    autoCreate: false,
    autoIndex: false,
  }).asPromise();
  try {
    const hello = await connection.db.admin().command({ hello: 1 });
    if (typeof hello.setName !== 'string') throw new Error('Replica set required');
    const model = connection.model(SessionReplacement.name, SessionReplacementSchema);
    await model.createCollection();
    await model.createIndexes();
    await verifyReplacementIndexes(model);
    console.info(
      'Session replacement storage initialized; no challenge, session, policy or account created.',
    );
  } finally {
    await connection.close();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error('Session replacement initialization failed; no automatic repair performed.');
    process.exitCode = 1;
  });
