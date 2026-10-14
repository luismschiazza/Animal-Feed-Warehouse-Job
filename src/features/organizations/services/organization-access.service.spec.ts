import { ForbiddenException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { Role } from '@/common/enums/role.enum';
import {
  MembershipStatus,
  OrganizationMembership,
} from '../schemas/organization-membership.schema';
import { Organization, OrganizationStatus } from '../schemas/organization.schema';
import { OrganizationAccessService } from './organization-access.service';

describe('OrganizationAccessService (mocked database)', () => {
  const userId = new Types.ObjectId().toString();
  const organizationId = new Types.ObjectId().toString();
  const membershipId = new Types.ObjectId();
  let service: OrganizationAccessService;
  const organizations = { findOne: jest.fn() };
  const memberships = { findOne: jest.fn() };
  const query = (result: unknown) => ({
    select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(result) }),
  });
  beforeEach(() => {
    jest.resetAllMocks();
    organizations.findOne.mockReturnValue(query({ _id: new Types.ObjectId(organizationId) }));
    memberships.findOne.mockReturnValue(query({ _id: membershipId, roles: [Role.MANAGER] }));
    service = new OrganizationAccessService(
      organizations as unknown as Model<Organization>,
      memberships as unknown as Model<OrganizationMembership>,
    );
  });
  it('resolves only the exact active organization and membership, returning stored roles', async () => {
    await expect(service.requireActiveMembership(userId, organizationId)).resolves.toEqual({
      userId,
      organizationId,
      membershipId: membershipId.toString(),
      roles: [Role.MANAGER],
    });
    expect(organizations.findOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(organizationId),
      status: OrganizationStatus.ACTIVE,
    });
    expect(memberships.findOne).toHaveBeenCalledWith({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(userId),
      status: MembershipStatus.ACTIVE,
    });
  });
  it('rejects invalid identifiers before querying', async () => {
    await expect(service.requireActiveMembership('bad', organizationId)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.requireActiveMembership(userId, 'bad')).rejects.toThrow(
      ForbiddenException,
    );
    expect(organizations.findOne).not.toHaveBeenCalled();
    expect(memberships.findOne).not.toHaveBeenCalled();
  });
  it('does not resolve a membership when the organization is unavailable', async () => {
    organizations.findOne.mockReturnValue(query(null));
    await expect(service.requireActiveMembership(userId, organizationId)).rejects.toThrow(
      'Organization access denied',
    );
    expect(memberships.findOne).not.toHaveBeenCalled();
  });
  it('denies a missing or inactive membership', async () => {
    memberships.findOne.mockReturnValue(query(null));
    await expect(service.requireActiveMembership(userId, organizationId)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it.each(
    [[], [Role.CUSTOMER, Role.CUSTOMER], ['FAKE'] as unknown as Role[]].map(
      (roles) => [roles] as const,
    ),
  )('denies invalid raw roles %j even if schema validation was bypassed', async (roles) => {
    memberships.findOne.mockReturnValue(query({ _id: membershipId, roles }));
    await expect(service.requireActiveMembership(userId, organizationId)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('propagates database failure without granting a tenant context', async () => {
    organizations.findOne.mockReturnValue({
      select: () => ({ exec: () => Promise.reject(new Error('database unavailable')) }),
    });
    await expect(service.requireActiveMembership(userId, organizationId)).rejects.toThrow(
      'database unavailable',
    );
    expect(memberships.findOne).not.toHaveBeenCalled();
  });
});
