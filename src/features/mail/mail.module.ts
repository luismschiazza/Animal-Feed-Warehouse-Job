import { Module } from '@nestjs/common';
import { registerHandlebarsHelpers } from './helpers/handlerBars-helpers';
import { GmailProvider } from './providers/gmail.provider';
import { InlineCssProvider } from './providers/inline-css.provider';
import { TemplateEngineProvider } from './providers/template-engine.provider';
import { MailService } from './services/mail.service';

registerHandlebarsHelpers();

@Module({
  providers: [GmailProvider, TemplateEngineProvider, MailService, InlineCssProvider],
  exports: [MailService],
})
export class MailModule {}
