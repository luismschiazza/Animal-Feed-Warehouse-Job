import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { rejectLegacySeed } from '@/commands/seed/services/seed.service';
import { AttendanceFactory } from '../factories/attendance.factory';
import { Attendance } from '../interfaces/attendance.interface';

@Injectable()
export class AttendancesSeeder {
  private readonly logger = new Logger(AttendancesSeeder.name);

  constructor(
    @InjectModel('Attendance')
    private readonly attendanceModel: Model<Attendance>,
  ) {}

  async run(limit = 20) {
    rejectLegacySeed();
    const data = AttendanceFactory.makeMany(limit);
    await this.attendanceModel.insertMany(data);
    this.logger.log(`✔ Created ${limit} attendance records.`);
  }
}
