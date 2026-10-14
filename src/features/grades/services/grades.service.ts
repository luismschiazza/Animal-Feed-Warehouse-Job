import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateGradeDto } from '../dtos/validation/create-grade.dto';
import { UpdateGradeDto } from '../dtos/validation/update-grade.dto';
import { Grade } from '../interfaces/grade.interface';

@Injectable()
export class GradesService {
  constructor(
    @InjectModel('Grade')
    private readonly gradeModel: Model<Grade>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateGradeDto, recordedBy: string) {
    const grade = new this.gradeModel({
      ...dto,
      recordedBy,
    });
    const saved = await grade.save();

    this.eventEmitter.emit('grade.created', saved);

    return saved;
  }

  async findAll() {
    return this.gradeModel.find().exec();
  }

  async findOne(id: string) {
    return this.gradeModel.findById(id).exec();
  }

  async update(id: string, dto: UpdateGradeDto) {
    return this.gradeModel.findByIdAndUpdate(id, dto, { new: true }).exec();
  }

  async delete(id: string) {
    return this.gradeModel.findByIdAndDelete(id).exec();
  }
}
