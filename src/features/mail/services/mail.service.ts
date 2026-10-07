import { Injectable, Logger } from '@nestjs/common';
import { SendMailOptions } from '../interfaces/send-mail-options.interface';
import { GmailProvider } from '../providers/gmail.provider';
import { TemplateEngineProvider } from '../providers/template-engine.provider';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly gmailProvider: GmailProvider,
    private readonly templateEngine: TemplateEngineProvider,
  ) {}

  async send(options: SendMailOptions): Promise<void> {
    const transporter = this.gmailProvider.getTransporter();

    const html = await this.templateEngine.render(options.template, options.context ?? {});

    const fromName = process.env.MAIL_FROM;
    const fromEmail = process.env.MAIL_FROM_MAIL;

    if (!fromName || !fromEmail) {
      this.logger.error('MAIL_FROM or MAIL_FROM_MAIL not set in environment variables');
      throw new Error('Missing email environment variables');
    }

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html,
      });

      this.logger.log(`Email sent to ${JSON.stringify(options.to)} (subject: ${options.subject})`);
    } catch (error) {
      this.logger.error('Error sending the email:', error.stack);
      throw error;
    }
  }
}
