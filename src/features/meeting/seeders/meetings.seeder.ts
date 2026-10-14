import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MeetingFactory } from '../factories/meeting.factory';
import { Meeting } from '../interfaces/meeting.interface';

@Injectable()
export class MeetingsSeeder {
  private readonly logger = new Logger(MeetingsSeeder.name);

  constructor(
    @InjectModel('Meeting')
    private readonly meetingModel: Model<Meeting>,
  ) {}

  async run(limit = 20) {
    const data = MeetingFactory.makeMany(limit);
    await this.meetingModel.insertMany(data);
    this.logger.log(`✔ Created ${limit} meetings.`);
  }
}
