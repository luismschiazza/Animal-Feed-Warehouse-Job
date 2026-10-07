import { Module } from '@nestjs/common';
import { MeetingModelModule } from '../models/meeting-model.module';
import { MeetingsSeeder } from './meetings.seeder';

@Module({
  imports: [MeetingModelModule],
  providers: [MeetingsSeeder],
  exports: [MeetingsSeeder],
})
export class MeetingsSeedModule {}
