import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { AuditScope, SecurityAuditService } from './security-audit.service';

// Read-only, bounded-memory archive. Never removes source events or authoritative rules.
export async function exportAudit(
  audit: SecurityAuditService,
  scope: AuditScope,
  destination: string,
) {
  const file = await open(destination, 'wx', 0o600);
  const digest = createHash('sha256');
  let count = 0;
  let cursor: string | undefined;
  try {
    do {
      const page = await audit.page(scope, 100, cursor);
      for (const record of page.items) {
        const line = JSON.stringify(record) + '\n';
        digest.update(line);
        await file.writeFile(line);
        count++;
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    await file.sync();
  } finally {
    await file.close();
  }
  // Exclusive creation: do not overwrite an existing archive or manifest.
  const manifest = await open(destination + '.manifest.json', 'wx', 0o600);
  try {
    await manifest.writeFile(
      JSON.stringify(
        {
          version: 1,
          scope,
          count,
          sha256: digest.digest('hex'),
          exportedAt: new Date().toISOString(),
          deletionPerformed: false,
        },
        null,
        2,
      ),
    );
    await manifest.sync();
  } finally {
    await manifest.close();
  }
  return { count };
}
