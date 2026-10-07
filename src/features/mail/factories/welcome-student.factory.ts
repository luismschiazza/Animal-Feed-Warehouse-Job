import { SendMailOptions } from '../interfaces/send-mail-options.interface';

export class WelcomeStudentFactory {
  static create(userEmail: string, userName: string, temporaryPassword?: string): SendMailOptions {
    return {
      to: userEmail,
      subject: 'Welcome to our school!',
      template: 'users/welcome-student.hbs',
      context: {
        userName,
        temporaryPassword,
        logoUrl: process.env.MAIL_LOGO_URL ?? '',
      },
    };
  }
}
