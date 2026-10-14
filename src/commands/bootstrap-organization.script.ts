import 'dotenv/config';
import { createConnection } from 'mongoose';
import { provisionInitialOrganization } from '@/common/authorization/provision-organization';

async function main() {
  if (!process.env.MONGO_URL) throw new Error('MONGO_URL required');
  const connection = await createConnection(process.env.MONGO_URL, {
    serverSelectionTimeoutMS: 10_000,
  }).asPromise();
  try {
    const result = await provisionInitialOrganization(connection, {
      organizationName: process.env.BOOTSTRAP_ORGANIZATION_NAME,
      adminName: process.env.BOOTSTRAP_ADMIN_NAME,
      adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
      adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    });
    // No password, hashes, connection URL or other credentials are printed.
    console.info('Initial organization provisioned:', result);
  } finally {
    await connection.close();
  }
}

if (require.main === module)
  void main().catch(() => {
    console.error(
      'Provisioning failed. Review configuration/database state; no credentials printed.',
    );
    process.exitCode = 1;
  });
