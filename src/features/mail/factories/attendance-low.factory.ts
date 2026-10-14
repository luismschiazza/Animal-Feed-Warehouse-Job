import { SendMailOptions } from '../interfaces/send-mail-options.interface';

export class AttendanceLowFactory {
  static create(
    userEmail: string,
    userName: string,
    disciplineName: string,
    percent: number,
    date: string,
  ): SendMailOptions {
    return {
      to: userEmail,
      subject: `Low attendance alert - ${disciplineName}`,
      template: 'attendance/low-attendance.hbs',
      context: {
        userName,
        disciplineName,
        percent: percent.toFixed(2),
        date,
        logoUrl: process.env.MAIL_LOGO_URL ?? '',
      },
    };
  }
}
