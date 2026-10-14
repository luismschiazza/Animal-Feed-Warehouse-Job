import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { GenerateJwtSecretCommand } from '@/commands/generate-jwt-secret.command';
import { SeedCommand } from '@/commands/seed.command';
import { SeedModule } from '@/commands/seed/seed.module';
import { ValidateObjectIdPipe } from '@/common/pipes/validate-object-id.pipe';
import { shouldSkipThrottle } from '@/common/throttling/throttler.config';
import { validateEnvironment } from '@/config/environment.validation';
import { AttendanceModule } from '@/features/attendance/attendance.module';
import { AuthModule } from '@/features/auth/auth.module';
import { DisciplinesModule } from '@/features/disciplines/disciplines.module';
import { GradesModule } from '@/features/grades/grades.module';
import { MeetingsModule } from '@/features/meeting/meeting.module';
import { UsersModule } from '@/features/users/users.module';
import { DatabaseModule } from '@/insfrastructure/database/database.module';
import { AppController } from './controllers/app.controller';
import { AppService } from './services/app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: seconds(60),
        limit: 5,
        skipIf: shouldSkipThrottle,
      },
    ]),

    DatabaseModule,
    AuthModule,
    DisciplinesModule,
    AttendanceModule,
    MeetingsModule,
    UsersModule,
    GradesModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    GenerateJwtSecretCommand,
    SeedCommand,
    ValidateObjectIdPipe,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
