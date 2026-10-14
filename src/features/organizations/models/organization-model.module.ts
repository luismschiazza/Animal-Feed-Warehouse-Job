import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from '../schemas/organization-membership.schema';
import { Organization, OrganizationSchema } from '../schemas/organization.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrganizationMembership.name, schema: OrganizationMembershipSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class OrganizationModelModule {}
