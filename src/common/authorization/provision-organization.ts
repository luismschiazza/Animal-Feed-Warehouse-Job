import * as bcrypt from 'bcryptjs';
import { isEmail } from 'class-validator';
import { Connection, Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { OrganizationMembershipSchema } from '@/features/organizations/schemas/organization-membership.schema';
import { OrganizationSchema } from '@/features/organizations/schemas/organization.schema';
import { UserSchema } from '@/features/users/schemas/user.schema';
import { AccountStatus } from '../enums/account-status.enum';
import { Role } from '../enums/role.enum';

// Operator-only, initial EMPTY database provisioning. Never expose as a public API.
export async function provisionInitialOrganization(
  connection: Connection,
  input: {
    organizationName: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  },
) {
  const organizationName = input.organizationName?.trim(),
    name = input.adminName?.trim();
  const email = input.adminEmail?.trim().toLowerCase(),
    password = input.adminPassword;
  if (
    !organizationName ||
    organizationName.length > 160 ||
    !name ||
    name.length > 160 ||
    !isEmail(email ?? '') ||
    typeof password !== 'string' ||
    password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error('Invalid initial organization/account configuration');
  }
  const runId = randomUUID();
  const marker = connection.db.collection<{ _id: string; runId: string; state: string }>(
    'bootstrap_state',
  );
  // _id uniqueness serializes competing initializations without a replica set.
  try {
    await marker.insertOne({ _id: 'initial-organization', runId, state: 'in-progress' });
  } catch {
    throw new Error('Initial provisioning already claimed; inspect database before retry');
  }
  const organizationId = new Types.ObjectId(),
    userId = new Types.ObjectId(),
    membershipId = new Types.ObjectId();
  let writesStarted = false;
  try {
    const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
    for (const collection of collections) {
      if (collection.name === 'bootstrap_state' || collection.name.startsWith('system.')) continue;
      if (await connection.db.collection(collection.name).findOne({}, { projection: { _id: 1 } })) {
        throw new Error(
          'Initial provisioning requires an empty database; no legacy data is assigned',
        );
      }
    }
    const users: Model<any> = connection.models.User || connection.model('User', UserSchema);
    const organizations: Model<any> =
      connection.models.Organization || connection.model('Organization', OrganizationSchema);
    const memberships: Model<any> =
      connection.models.OrganizationMembership ||
      connection.model('OrganizationMembership', OrganizationMembershipSchema);
    await Promise.all([users.init(), organizations.init(), memberships.init()]);
    const hash = await bcrypt.hash(password, 12);
    writesStarted = true;
    await users.create({
      _id: userId,
      name,
      email,
      password: hash,
      status: AccountStatus.ACTIVE,
      roles: [Role.CUSTOMER],
    });
    await organizations.create({ _id: organizationId, name: organizationName, status: 'active' });
    const roles = [Role.ORGANIZATION_OWNER, Role.MANAGER, Role.SYSTEM_ADMIN];
    await memberships.create({
      _id: membershipId,
      organizationId,
      userId,
      status: 'active',
      roles,
    });
    await marker.updateOne(
      { _id: 'initial-organization', runId },
      { $set: { state: 'completed' } },
    );
    return { organizationId: organizationId.toString(), userId: userId.toString(), roles };
  } catch (error) {
    try {
      // Delete only this run's reserved IDs, never pre-existing records.
      if (writesStarted)
        await Promise.all([
          connection.models.User.deleteOne({ _id: userId }),
          connection.models.Organization.deleteOne({ _id: organizationId }),
          connection.models.OrganizationMembership.deleteOne({ _id: membershipId }),
        ]);
      await marker.deleteOne({ _id: 'initial-organization', runId });
    } catch {
      throw new Error('Provisioning interrupted; manual database review required');
    }
    throw error;
  }
}
