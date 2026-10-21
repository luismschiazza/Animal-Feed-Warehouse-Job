import { createConnection } from 'mongoose';
import 'reflect-metadata';
import { verifyAuditIndexes } from '../common/audit/audit-indexes';
import { SecurityAuditRecord, SecurityAuditSchema } from '../common/audit/security-audit.schema';
import {
  SessionRevocation,
  SessionRevocationSchema,
} from '../features/auth/schemas/session-revocation.schema';

async function main() {
  const uri = process.env.AUDIT_MONGO_URL;
  if (!uri) throw new Error('Explicit operator database required');
  const connection = await createConnection(uri, {
    autoCreate: false,
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
  }).asPromise();
  try {
    for (const [name, schema] of [
      [SecurityAuditRecord.name, SecurityAuditSchema],
      [SessionRevocation.name, SessionRevocationSchema],
    ] as const) {
      const model = connection.model(name, schema);
      // Create only; never drop a collection/index, rewrite an event or delete a rule.
      await model.createCollection();
      await model.createIndexes();
      await verifyAuditIndexes(model);
    }
    console.info('Audit collections/indexes provisioned and verified; no events deleted.');
  } finally {
    await connection.close();
  }
}
main().catch(() => {
  console.error(
    'Audit initialization failed; operator must review configuration/indexes. No automatic destructive repair.',
  );
  process.exitCode = 1;
});
