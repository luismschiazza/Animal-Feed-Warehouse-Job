import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateDisciplineDto } from '../dtos/validation/create-discipline.dto';
import { UpdateDisciplineDto } from '../dtos/validation/update-discipline.dto';
import { Discipline } from '../interfaces/discipline.interface';

@Injectable()
export class DisciplinesService {
  constructor(
    @InjectModel('Discipline')
    private readonly disciplineModel: Model<Discipline>,
  ) {}

  async create(createDisciplineDto: CreateDisciplineDto): Promise<Discipline> {
    const created = new this.disciplineModel({
      ...createDisciplineDto,
    });
    return created.save();
  }

  async findAll(): Promise<Discipline[]> {
    return this.disciplineModel.find().exec();
  }

  async findOneById(id: string): Promise<Discipline | null> {
    return this.disciplineModel.findById(id).exec();
  }

  async update(id: string, updateDisciplineDto: UpdateDisciplineDto): Promise<Discipline | null> {
    const existing = await this.findOneById(id);
    if (!existing) {
      return null;
    }

    return this.disciplineModel.findByIdAndUpdate(id, updateDisciplineDto, { new: true }).exec();
  }

  async delete(id: string): Promise<Discipline | null> {
    const existing = await this.findOneById(id);
    if (!existing) {
      return null;
    }

    return this.disciplineModel.findByIdAndDelete(id).exec();
  }
}
