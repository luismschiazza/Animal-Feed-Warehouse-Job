import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditContext, AuditContextMiddleware } from './audit-context.service';
import { SecurityAuditRecord, SecurityAuditSchema } from './security-audit.schema';
import { SecurityAuditService } from './security-audit.service';
import { SecurityExceptionFilter } from './security-exception.filter';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: SecurityAuditRecord.name, schema: SecurityAuditSchema }]),
  ],
  providers: [
    SecurityAuditService,
    AuditContext,
    AuditContextMiddleware,
    { provide: APP_FILTER, useClass: SecurityExceptionFilter },
  ],
  exports: [SecurityAuditService, AuditContext],
})
export class SecurityAuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuditContextMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
