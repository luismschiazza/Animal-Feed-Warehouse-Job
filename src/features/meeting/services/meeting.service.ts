import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateMeetingDto } from '../dtos/validation/create-meeting.dto';
import { UpdateMeetingDto } from '../dtos/validation/update-meeting.dto';
import { Meeting } from '../interfaces/meeting.interface';

@Injectable()
export class MeetingsService {
  constructor(
    @InjectModel('Meeting')
    private readonly meetingModel: Model<Meeting>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async checkScheduleConflict(start: Date, end: Date, ignoreId?: string) {
    const conflict = await this.meetingModel.findOne({
      _id: { $ne: ignoreId },
      start_at: { $lte: end },
      end_at: { $gte: start },
    });

    if (conflict) {
      throw new BadRequestException('Meeting time conflict');
    }
  }

  async create(dto: CreateMeetingDto, createdBy: string) {
    const start = new Date(dto.start_at);
    const end = new Date(dto.end_at);

    await this.checkScheduleConflict(start, end);

    const meeting = new this.meetingModel({
      ...dto,
      start_at: start,
      end_at: end,
      createdBy,
    });

    const saved = await meeting.save();

    this.eventEmitter.emit('meeting.created', saved);

    return saved;
  }

  async findAll() {
    return this.meetingModel.find().exec();
  }

  async findOne(id: string) {
    return this.meetingModel.findById(id).exec();
  }

  async update(id: string, dto: UpdateMeetingDto) {
    const existing = await this.meetingModel.findById(id);
    if (!existing) return null;

    const start = dto.start_at ? new Date(dto.start_at) : existing.start_at;
    const end = dto.end_at ? new Date(dto.end_at) : existing.end_at;

    await this.checkScheduleConflict(start, end, id);

    return this.meetingModel
      .findByIdAndUpdate(id, { ...dto, start_at: start, end_at: end }, { new: true })
      .exec();
  }

  async delete(id: string) {
    return this.meetingModel.findByIdAndDelete(id).exec();
  }
}
