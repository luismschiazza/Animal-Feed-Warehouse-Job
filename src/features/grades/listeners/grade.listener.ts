import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { GradeReleasedFactory } from '@/features/mail/factories/grade-released.factory';
import { MailService } from '@/features/mail/services/mail.service';

@Injectable()
export class GradeListener {
  private readonly logger = new Logger(GradeListener.name);
  constructor(
    private readonly resources: ScopedResourcesService,
    private readonly mailer: MailService,
  ) {}
  @OnEvent('grade.created')
  async handleGradeCreated(event: { record: { id: string }; subject: PolicySubject }) {
    const {
      record: grade,
      student,
      discipline,
    } = await this.resources.notification(PolicyResource.LEGACY_GRADE, event);
    const payload = GradeReleasedFactory.create(
      student.email,
      student.name,
      discipline.name,
      grade.value,
      grade.type,
      grade.term,
      grade.comments,
    );
    await this.mailer.send(payload);
    this.logger.log('Organization-scoped grade notification sent');
  }
}
