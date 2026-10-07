import { SendMailOptions } from '../interfaces/send-mail-options.interface';

export class MeetingScheduledFactory {
  static create(
    userEmail: string,
    userName: string,
    meetingTitle: string,
    meetingDescription: string,
    startAt: string,
    endAt: string,
  ): SendMailOptions {
    return {
      to: userEmail,
      subject: `Meeting scheduled – ${meetingTitle}`,
      template: 'meetings/meeting-scheduled.hbs',
      context: {
        userName,
        meetingTitle,
        meetingDescription,
        startAt,
        endAt,
        logoUrl: process.env.MAIL_LOGO_URL ?? '',
      },
    };
  }
}
