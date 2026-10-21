import { createConnection } from 'mongoose';
import 'reflect-metadata';
import { AuditContext } from '../common/audit/audit-context.service';
import { exportAudit } from '../common/audit/audit-export';
import { SecurityAuditRecord, SecurityAuditSchema } from '../common/audit/security-audit.schema';
import { AuditScope, SecurityAuditService } from '../common/audit/security-audit.service';

async function main() {
  // No dotenv or fallback to MONGO_URL. Operator must select the source deliberately.
  const uri = process.env.AUDIT_MONGO_URL,
    destination = process.env.AUDIT_EXPORT_PATH;
  const kind = process.env.AUDIT_SCOPE,
    id = process.env.AUDIT_SCOPE_ID;
  if (
    !uri ||
    !destination ||
    !['anonymous', 'user', 'organization'].includes(kind ?? '') ||
    (kind !== 'anonymous' && !/^[a-f0-9]{24}$/i.test(id ?? ''))
  )
    throw new Error('Invalid audit export configuration');
  const scope: AuditScope =
    kind === 'anonymous' ? { kind } : { kind: kind as 'user' | 'organization', id };
  const connection = await createConnection(uri, {
    autoCreate: false,
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
  }).asPromise();
  try {
    // Schema options override connection defaults: explicitly suppress all model DDL.
    const schema = SecurityAuditSchema.clone().set('autoCreate', false).set('autoIndex', false);
    const model = connection.model<SecurityAuditRecord>(SecurityAuditRecord.name, schema);
    const result = await exportAudit(
      new SecurityAuditService(model, new AuditContext()),
      scope,
      destination,
    );
    console.info(`Audit export completed: ${result.count} events; no source deletion performed.`);
  } finally {
    await connection.close();
  }
}
main().catch(() => {
  console.error(
    'Audit export failed. Check configuration/access and incomplete local files; no automatic deletion or overwrite.',
  );
  process.exitCode = 1;
});
