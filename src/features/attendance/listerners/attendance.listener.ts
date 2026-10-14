import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { AttendanceLowFactory } from '@/features/mail/factories/attendance-low.factory';
import { MailService } from '@/features/mail/services/mail.service';

@Injectable()
export class AttendanceListener {
  private readonly logger = new Logger(AttendanceListener.name);
  constructor(
    private readonly resources: ScopedResourcesService,
    private readonly mailer: MailService,
  ) {}
  @OnEvent('attendance.created')
  async handleAttendanceCreated(event: { record: { id: string }; subject: PolicySubject }) {
    const {
      record: attendance,
      student,
      discipline,
      totalClasses,
      totalPresent,
    } = await this.resources.notification(PolicyResource.LEGACY_ATTENDANCE, event);
    if (!totalClasses) return;
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
      this.logger.log('Organization-scoped attendance notification sent');
    }
  }
}
