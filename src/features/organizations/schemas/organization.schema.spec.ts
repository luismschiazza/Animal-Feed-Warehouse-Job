import { Types, model } from 'mongoose';
import { Role } from '@/common/enums/role.enum';
import {
  MembershipStatus,
  OrganizationMembership,
  OrganizationMembershipSchema,
} from './organization-membership.schema';
import { Organization, OrganizationSchema, OrganizationStatus } from './organization.schema';

const OrganizationModel = model<Organization>('OrganizationSchemaUnitTest', OrganizationSchema);
const MembershipModel = model<OrganizationMembership>(
  'MembershipSchemaUnitTest',
  OrganizationMembershipSchema,
);
const membership = (roles: Role[] = [Role.CUSTOMER]) =>
  new MembershipModel({
    organizationId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    roles,
  });

describe('Organization and membership schemas (without database)', () => {
  it('validates organization names and defaults its status', () => {
    const organization = new OrganizationModel({ name: ' Feed warehouse ' });
    expect(organization.validateSync()).toBeUndefined();
    expect(organization.name).toBe('Feed warehouse');
    expect(organization.status).toBe(OrganizationStatus.ACTIVE);
    expect(new OrganizationModel({ name: '   ' }).validateSync()?.errors).toHaveProperty('name');
  });
  it('rejects invalid statuses and oversized names', () => {
    const organization = new OrganizationModel({ name: 'x'.repeat(201), status: 'unknown' });
    expect(organization.validateSync()?.errors).toHaveProperty('name');
    expect(organization.validateSync()?.errors).toHaveProperty('status');
  });
  it('defaults a membership to invited, never active or administrator', () => {
    const result = membership();
    expect(result.validateSync()).toBeUndefined();
    expect(result.status).toBe(MembershipStatus.INVITED);
    expect(result.roles).toEqual([Role.CUSTOMER]);
  });
  it('requires organization and user references', () => {
    const error = new MembershipModel().validateSync();
    expect(error?.errors).toHaveProperty('organizationId');
    expect(error?.errors).toHaveProperty('userId');
  });
  it.each(
    [[], [Role.CUSTOMER, Role.CUSTOMER], ['FAKE'] as unknown as Role[]].map(
      (roles) => [roles] as const,
    ),
  )('rejects invalid membership roles %j', (roles) => {
    expect(membership(roles).validateSync()).toBeDefined();
  });
  it('declares reference fields as ObjectId, not untyped Mixed values', () => {
    expect(OrganizationMembershipSchema.path('organizationId').instance).toBe('ObjectId');
    expect(OrganizationMembershipSchema.path('userId').instance).toBe('ObjectId');
  });

  it('declares one unique membership per organization/user pair', () => {
    expect(OrganizationMembershipSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ organizationId: 1, userId: 1 }, expect.objectContaining({ unique: true })],
      ]),
    );
  });
});
