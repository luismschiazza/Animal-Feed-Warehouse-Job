import { Module } from '@nestjs/common';
import { OrganizationModelModule } from './models/organization-model.module';
import { OrganizationAccessService } from './services/organization-access.service';

@Module({
  imports: [OrganizationModelModule],
  providers: [OrganizationAccessService],
  exports: [OrganizationAccessService],
})
export class OrganizationsModule {}
