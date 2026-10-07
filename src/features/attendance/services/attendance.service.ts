import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateAttendanceDto } from '../dtos/validation/create-attendance.dto';
import { UpdateAttendanceDto } from '../dtos/validation/update-attendance.dto';
import { Attendance } from '../interfaces/attendance.interface';

@Injectable()
export class AttendancesService {
  constructor(
    @InjectModel('Attendance')
    private readonly attendanceModel: Model<Attendance>,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateAttendanceDto, recordedBy: string): Promise<Attendance> {
    const created = new this.attendanceModel({
      ...dto,
      recordedBy,
    });
    const saved = await created.save();
    this.eventEmitter.emit('attendance.created', saved);
    return saved;
  }

  async findAll(): Promise<Attendance[]> {
    return this.attendanceModel.find().exec();
  }

  async findOneById(id: string): Promise<Attendance | null> {
    return this.attendanceModel.findById(id).exec();
  }

  async update(id: string, dto: UpdateAttendanceDto): Promise<Attendance | null> {
    return this.attendanceModel.findByIdAndUpdate(id, dto, { new: true }).exec();
  }

  async delete(id: string): Promise<Attendance | null> {
    return this.attendanceModel.findByIdAndDelete(id).exec();
  }
}
