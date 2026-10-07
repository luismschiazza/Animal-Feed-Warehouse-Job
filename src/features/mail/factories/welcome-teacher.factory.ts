import { SendMailOptions } from '../interfaces/send-mail-options.interface';

export class WelcomeTeacherFactory {
  static create(userEmail: string, userName: string, temporaryPassword?: string): SendMailOptions {
    return {
      to: userEmail,
      subject: 'Welcome to the teaching team!',
      template: 'users/welcome-teacher.hbs',
      context: {
        userName,
        temporaryPassword,
        logoUrl: process.env.MAIL_LOGO_URL ?? '',
      },
    };
  }
}
