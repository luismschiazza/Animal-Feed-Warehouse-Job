import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '@/common/enums/role.enum';
import {
  MembershipStatus,
  OrganizationMembership,
} from '../schemas/organization-membership.schema';
import { Organization, OrganizationStatus } from '../schemas/organization.schema';

export interface OrganizationAccess {
  userId: string;
  organizationId: string;
  membershipId: string;
  roles: Role[];
}

@Injectable()
export class OrganizationAccessService {
  constructor(
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    @InjectModel(OrganizationMembership.name)
    private readonly memberships: Model<OrganizationMembership>,
  ) {}

  // Validate on the server; never accept roles/organization ownership from a request body.
  // Account and session validity must be checked by authentication before using this resolver.
  async requireActiveMembership(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationAccess> {
    if (!this.isObjectId(userId) || !this.isObjectId(organizationId)) throw this.denied();
    const owner = new Types.ObjectId(userId);
    const organization = new Types.ObjectId(organizationId);
    const activeOrganization = await this.organizations
      .findOne({
        _id: organization,
        status: OrganizationStatus.ACTIVE,
      })
      .select('_id')
      .exec();
    if (!activeOrganization) throw this.denied();
    const membership = await this.memberships
      .findOne({
        organizationId: organization,
        userId: owner,
        status: MembershipStatus.ACTIVE,
      })
      .select('_id organizationId userId roles')
      .exec();
    // Validate roles too: schema validators do not protect against old/raw database writes.
    if (
      !membership ||
      !Array.isArray(membership.roles) ||
      membership.roles.length === 0 ||
      membership.roles.length > Object.values(Role).length ||
      new Set(membership.roles).size !== membership.roles.length ||
      membership.roles.some((role) => !Object.values(Role).includes(role))
    )
      throw this.denied();
    return {
      userId: owner.toString(),
      organizationId: organization.toString(),
      membershipId: membership._id.toString(),
      roles: [...membership.roles],
    };
  }

  private isObjectId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
  }

  private denied() {
    // Same response for missing organization, missing membership or suspended state.
    return new ForbiddenException('Organization access denied');
  }
}
