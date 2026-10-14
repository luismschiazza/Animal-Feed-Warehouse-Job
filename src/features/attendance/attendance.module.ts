import { Module } from '@nestjs/common';
import { DisciplineModelModule } from '../disciplines/models/discipline-model.module';
import { MailModule } from '../mail/mail.module';
import { UserModelModule } from '../users/models/user-model.module';
import { AttendancesController } from './controllers/attendance.controller';
import { AttendanceListener } from './listerners/attendance.listener';
import { AttendanceModelModule } from './models/attendance-model.module';
import { AttendancesSeeder } from './seeders/attendance.seeder';
import { AttendancesService } from './services/attendance.service';

@Module({
  imports: [AttendanceModelModule, MailModule, DisciplineModelModule, UserModelModule],
  controllers: [AttendancesController],
  providers: [AttendancesService, AttendancesSeeder, AttendanceListener],
  exports: [AttendancesService],
})
export class AttendanceModule {}
