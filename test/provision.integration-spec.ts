import * as bcrypt from 'bcryptjs';
import { Connection, createConnection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { provisionInitialOrganization } from '@/common/authorization/provision-organization';
import { Role } from '@/common/enums/role.enum';

describe('Initial provisioning — isolated, empty MongoDB', () => {
  let connection: Connection;
  let databaseName: string;
  const input = {
    organizationName: 'Feed store',
    adminName: 'Store owner',
    adminEmail: 'owner@example.com',
    adminPassword: 'isolated-test-password',
  };
  beforeEach(async () => {
    if (!process.env.ABAC_TEST_MONGO_URL) throw new Error('ABAC_TEST_MONGO_URL required');
    databaseName = `abac_test_bootstrap_${randomUUID().replace(/-/g, '')}`;
    connection = await createConnection(process.env.ABAC_TEST_MONGO_URL, {
      dbName: databaseName,
    }).asPromise();
  });
  afterEach(async () => {
    if (connection?.name === databaseName) await connection.dropDatabase();
    await connection?.close();
  });
  it('creates active identity/organization/membership without global administrative roles', async () => {
    const result = await provisionInitialOrganization(connection, input);
    const account = await connection.models.User.findById(result.userId).select('+password +roles');
    expect(account.status).toBe('active');
    expect(account.roles).toEqual([Role.CUSTOMER]);
    expect(account.password).not.toBe(input.adminPassword);
    expect(await bcrypt.compare(input.adminPassword, account.password)).toBe(true);
    const membership = await connection.models.OrganizationMembership.findOne({
      userId: result.userId,
      organizationId: result.organizationId,
    });
    expect(membership.status).toBe('active');
    expect(membership.roles).toContain(Role.SYSTEM_ADMIN);
    expect(membership.userId.toString()).toBe(result.userId);
    expect(
      await connection.models.OrganizationMembership.collection.countDocuments({
        userId: { $type: 'objectId' },
        organizationId: { $type: 'objectId' },
      }),
    ).toBe(1);
    await expect(provisionInitialOrganization(connection, input)).rejects.toThrow(
      'already claimed',
    );
    expect(await connection.models.User.countDocuments()).toBe(1);
  });
  it('serializes competing initializations; only one organization/admin is created', async () => {
    const attempts = await Promise.allSettled([
      provisionInitialOrganization(connection, input),
      provisionInitialOrganization(connection, input),
    ]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await connection.models.User.countDocuments()).toBe(1);
    expect(await connection.models.Organization.countDocuments()).toBe(1);
    expect(await connection.models.OrganizationMembership.countDocuments()).toBe(1);
  });
  it('rejects nonempty databases without assigning, modifying or deleting existing records', async () => {
    const original = { name: 'Unscoped legacy' };
    const saved = await connection.db.collection('disciplines').insertOne(original);
    await expect(provisionInitialOrganization(connection, input)).rejects.toThrow('empty database');
    expect(
      await connection.db.collection('disciplines').findOne({ _id: saved.insertedId }),
    ).toMatchObject(original);
    expect(await connection.db.collection('users').countDocuments()).toBe(0);
    expect(await connection.db.collection('bootstrap_state').countDocuments()).toBe(0);
  });
  it('rejects invalid configuration before database writes', async () => {
    await expect(
      provisionInitialOrganization(connection, { ...input, adminPassword: 'weak' }),
    ).rejects.toThrow('Invalid');
    await expect(
      provisionInitialOrganization(connection, { ...input, adminEmail: 'invalid' }),
    ).rejects.toThrow('Invalid');
    expect(await connection.db.collection('bootstrap_state').countDocuments()).toBe(0);
    expect(await connection.db.collection('users').countDocuments()).toBe(0);
  });
});
