import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MeetingScheduledFactory } from '@/features/mail/factories/meeting-scheduled.factory';
import { MailService } from '@/features/mail/services/mail.service';
import { User } from '@/features/users/interfaces/user.interface';
import { Meeting } from '../interfaces/meeting.interface';

@Injectable()
export class MeetingListener {
  private readonly logger = new Logger(MeetingListener.name);

  constructor(
    @InjectModel('User')
    private readonly userModel: Model<User>,

    private readonly mailer: MailService,
  ) {}

  @OnEvent('meeting.created')
  async handleMeetingCreated(meeting: Meeting) {
    for (const participantId of meeting.participants) {
      const user = await this.userModel.findById(participantId);

      if (!user) continue;

      const payload = MeetingScheduledFactory.create(
        user.email,
        user.name,
        meeting.title,
        meeting.description,
        meeting.start_at.toISOString(),
        meeting.end_at.toISOString(),
      );

      await this.mailer.send(payload);

      this.logger.log(`Meeting notification sent → ${user.email} (${meeting.title})`);
    }
  }
}
