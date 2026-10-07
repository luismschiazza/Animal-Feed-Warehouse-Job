import { Module } from '@nestjs/common';
import { AttendanceModelModule } from '../models/attendance-model.module';
import { AttendancesSeeder } from './attendance.seeder';

@Module({
  imports: [AttendanceModelModule],
  providers: [AttendancesSeeder],
  exports: [AttendancesSeeder],
})
export class AttendancesSeedModule {}
