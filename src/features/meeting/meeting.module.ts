import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UserModelModule } from '../users/models/user-model.module';
import { MeetingsController } from './controllers/meeting.controller';
import { MeetingListener } from './listeners/meeting.listener';
import { MeetingModelModule } from './models/meeting-model.module';
import { MeetingsSeeder } from './seeders/meetings.seeder';
import { MeetingsService } from './services/meeting.service';

@Module({
  imports: [MeetingModelModule, MailModule, UserModelModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingsSeeder, MeetingListener],
  exports: [MeetingsService],
})
export class MeetingsModule {}
