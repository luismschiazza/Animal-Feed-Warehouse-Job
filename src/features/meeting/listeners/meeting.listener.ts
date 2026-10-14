import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { MeetingScheduledFactory } from '@/features/mail/factories/meeting-scheduled.factory';
import { MailService } from '@/features/mail/services/mail.service';

@Injectable()
export class MeetingListener {
  private readonly logger = new Logger(MeetingListener.name);
  constructor(
    private readonly resources: ScopedResourcesService,
    private readonly mailer: MailService,
  ) {}
  @OnEvent('meeting.created')
  async handleMeetingCreated(event: { record: { id: string }; subject: PolicySubject }) {
    const { record: meeting, participants } = await this.resources.notification(
      PolicyResource.LEGACY_MEETING,
      event,
    );
    for (const user of participants) {
      const payload = MeetingScheduledFactory.create(
        user.email,
        user.name,
        meeting.title,
        meeting.description,
        meeting.start_at.toISOString(),
        meeting.end_at.toISOString(),
      );
      await this.mailer.send(payload);
    }
    this.logger.log('Organization-scoped meeting notifications sent');
  }
}
