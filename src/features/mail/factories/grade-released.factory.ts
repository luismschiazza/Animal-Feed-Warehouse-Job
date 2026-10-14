import { SendMailOptions } from '../interfaces/send-mail-options.interface';

export class GradeReleasedFactory {
  static create(
    userEmail: string,
    userName: string,
    disciplineName: string,
    gradeValue: number,
    gradeType: string,
    gradeTerm: string,
    comments?: string,
  ): SendMailOptions {
    return {
      to: userEmail,
      subject: `New grade released – ${disciplineName}`,
      template: 'grades/grade-released.hbs',
      context: {
        userName,
        disciplineName,
        gradeValue,
        gradeType,
        gradeTerm,
        comments,
        logoUrl: process.env.MAIL_LOGO_URL ?? '',
      },
    };
  }
}
