import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@/features/auth/auth.module';
import { PoliciesGuard } from './policies.guard';
import { PolicyEngine } from './policy-engine.service';
import { ScopedResourcesModule } from './scoped-resources.module';

@Module({
  imports: [AuthModule, ScopedResourcesModule],
  providers: [PolicyEngine, { provide: APP_GUARD, useClass: PoliciesGuard }],
  exports: [PolicyEngine],
})
export class AuthorizationModule {}
