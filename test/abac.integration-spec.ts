import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Role } from '@/common/enums/role.enum';
import { OrganizationsModule } from '@/features/organizations/organizations.module';
import {
  MembershipStatus,
  OrganizationMembership,
} from '@/features/organizations/schemas/organization-membership.schema';
import {
  Organization,
  OrganizationStatus,
} from '@/features/organizations/schemas/organization.schema';
import { OrganizationAccessService } from '@/features/organizations/services/organization-access.service';

// Foundation only: no claim of resource/HTTP isolation until those services are migrated.
describe('ABAC foundation — organization membership with real MongoDB', () => {
  let module: TestingModule;
  let connection: Connection;
  let organizations: Model<Organization>;
  let memberships: Model<OrganizationMembership>;
  let access: OrganizationAccessService;
  let organizationA: string;
  let organizationB: string;
  let userId: string;
  const databaseName = `abac_test_${randomUUID().replace(/-/g, '')}`;

  beforeAll(async () => {
    const uri = process.env.ABAC_TEST_MONGO_URL;
    if (!uri) throw new Error('Set ABAC_TEST_MONGO_URL to an isolated MongoDB test server');
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: databaseName, serverSelectionTimeoutMS: 10_000 }),
        OrganizationsModule,
      ],
    }).compile();
    await module.init();
    connection = module.get(getConnectionToken());
    organizations = module.get(getModelToken(Organization.name));
    memberships = module.get(getModelToken(OrganizationMembership.name));
    access = module.get(OrganizationAccessService);
    await memberships.init();
  });
  beforeEach(async () => {
    await memberships.deleteMany({});
    await organizations.deleteMany({});
    organizationA = (await organizations.create({ name: 'Warehouse A' }))._id.toString();
    organizationB = (await organizations.create({ name: 'Warehouse B' }))._id.toString();
    userId = new Types.ObjectId().toString();
    await memberships.create({
      userId,
      organizationId: organizationA,
      status: MembershipStatus.ACTIVE,
      roles: [Role.MANAGER],
    });
  });
  afterAll(async () => {
    if (connection?.name === databaseName) await connection.dropDatabase();
    if (module) await module.close();
  });

  it('resolves A and denies B without a membership', async () => {
    await expect(access.requireActiveMembership(userId, organizationA)).resolves.toMatchObject({
      organizationId: organizationA,
      roles: [Role.MANAGER],
    });
    await expect(access.requireActiveMembership(userId, organizationB)).rejects.toThrow(
      'Organization access denied',
    );
  });
  it('keeps roles scoped per organization for the same user', async () => {
    await memberships.create({
      userId,
      organizationId: organizationB,
      status: MembershipStatus.ACTIVE,
      roles: [Role.CUSTOMER],
    });
    expect((await access.requireActiveMembership(userId, organizationA)).roles).toEqual([
      Role.MANAGER,
    ]);
    expect((await access.requireActiveMembership(userId, organizationB)).roles).toEqual([
      Role.CUSTOMER,
    ]);
  });
  it.each([MembershipStatus.INVITED, MembershipStatus.SUSPENDED, MembershipStatus.REVOKED])(
    'denies %s membership',
    async (status) => {
      await memberships.updateOne({ userId, organizationId: organizationA }, { $set: { status } });
      await expect(access.requireActiveMembership(userId, organizationA)).rejects.toThrow(
        'Organization access denied',
      );
    },
  );
  it('denies a suspended organization even with an active administrator membership', async () => {
    await memberships.updateOne(
      { userId, organizationId: organizationA },
      { $set: { roles: [Role.SYSTEM_ADMIN] } },
    );
    await organizations.updateOne(
      { _id: organizationA },
      { $set: { status: OrganizationStatus.SUSPENDED } },
    );
    await expect(access.requireActiveMembership(userId, organizationA)).rejects.toThrow(
      'Organization access denied',
    );
    await expect(access.requireActiveMembership(userId, organizationB)).rejects.toThrow(
      'Organization access denied',
    );
  });
  it('denies another user and does not enroll or create missing entities automatically', async () => {
    await expect(
      access.requireActiveMembership(new Types.ObjectId().toString(), organizationA),
    ).rejects.toThrow();
    await expect(
      access.requireActiveMembership(userId, new Types.ObjectId().toString()),
    ).rejects.toThrow();
    expect(await memberships.countDocuments()).toBe(1);
    expect(await organizations.countDocuments()).toBe(2);
  });
  it('enforces the compound unique index but permits the same user in another organization', async () => {
    expect(
      await memberships.collection.countDocuments({
        organizationId: { $type: 'objectId' },
        userId: { $type: 'objectId' },
      }),
    ).toBe(1);
    await expect(
      memberships.create({ userId, organizationId: organizationA }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      memberships.create({ userId, organizationId: organizationB }),
    ).resolves.toBeTruthy();
    await expect(access.requireActiveMembership(userId, organizationB)).rejects.toThrow();
  });
  it('denies invalid roles inserted by raw writes that bypass schema validators', async () => {
    await memberships.collection.updateOne(
      { userId: new Types.ObjectId(userId), organizationId: new Types.ObjectId(organizationA) },
      { $set: { roles: ['FAKE_ROLE'] } },
    );
    await expect(access.requireActiveMembership(userId, organizationA)).rejects.toThrow(
      'Organization access denied',
    );
  });
});
