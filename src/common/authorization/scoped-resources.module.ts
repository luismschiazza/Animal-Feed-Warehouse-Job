import { Global, Module } from '@nestjs/common';
import { AttendanceModelModule } from '@/features/attendance/models/attendance-model.module';
import { AuthSessionsModule } from '@/features/auth/auth-sessions.module';
import { DisciplineModelModule } from '@/features/disciplines/models/discipline-model.module';
import { GradeModelModule } from '@/features/grades/models/grade-model.module';
import { MeetingModelModule } from '@/features/meeting/models/meeting-model.module';
import { OrganizationsModule } from '@/features/organizations/organizations.module';
import { ProductModelModule } from '@/features/products/models/product-model.module';
import { UserModelModule } from '@/features/users/models/user-model.module';
import { PolicyEngine } from './policy-engine.service';
import { ScopedResourcesService } from './scoped-resources.service';

@Global()
@Module({
  imports: [
    AuthSessionsModule,
    OrganizationsModule,
    UserModelModule,
    DisciplineModelModule,
    AttendanceModelModule,
    GradeModelModule,
    MeetingModelModule,
    ProductModelModule,
  ],
  providers: [ScopedResourcesService, PolicyEngine],
  exports: [ScopedResourcesService],
})
export class ScopedResourcesModule {}
