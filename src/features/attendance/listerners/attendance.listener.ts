import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Discipline } from '@/features/disciplines/interfaces/discipline.interface';
import { AttendanceLowFactory } from '@/features/mail/factories/attendance-low.factory';
import { MailService } from '@/features/mail/services/mail.service';
import { User } from '@/features/users/interfaces/user.interface';
import { Attendance } from '../interfaces/attendance.interface';

@Injectable()
export class AttendanceListener {
  private readonly logger = new Logger(AttendanceListener.name);

  constructor(
    @InjectModel('Attendance')
    private readonly attendanceModel: Model<Attendance>,

    @InjectModel('User')
    private readonly userModel: Model<User>,

    @InjectModel('Discipline')
    private readonly disciplineModel: Model<Discipline>,

    private readonly mailer: MailService,
  ) {}

  @OnEvent('attendance.created')
  async handleAttendanceCreated(attendance: Attendance) {
    const student = await this.userModel.findById(attendance.student);
    const discipline = await this.disciplineModel.findById(attendance.discipline);

    if (!student || !discipline) return;

    const totalClasses = await this.attendanceModel.countDocuments({
      student: student.id,
      discipline: discipline.id,
    });

    if (totalClasses === 0) return;

    const totalPresent = await this.attendanceModel.countDocuments({
      student: student.id,
      discipline: discipline.id,
      status: 'PRESENT',
    });

    const percent = (totalPresent / totalClasses) * 100;

    if (percent < 75) {
      const payload = AttendanceLowFactory.create(
        student.email,
        student.name,
        discipline.name,
        percent,
        attendance.date.toISOString(),
      );

      await this.mailer.send(payload);

      this.logger.log(`Low attendance email sent → ${student.email} (${percent.toFixed(2)}%)`);
    }
  }
}
