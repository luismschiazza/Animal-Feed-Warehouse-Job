import { Module } from '@nestjs/common';
import { MailModule } from '../mail.module';
import { MailSeed } from './mail.seed';

@Module({
  imports: [MailModule],
  providers: [MailSeed],
  exports: [MailSeed],
})
export class MailSeedModule {}
