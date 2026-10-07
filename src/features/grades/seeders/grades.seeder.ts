import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GradeFactory } from '../factories/grade.factory';
import { Grade } from '../interfaces/grade.interface';

@Injectable()
export class GradesSeeder {
  private readonly logger = new Logger(GradesSeeder.name);

  constructor(
    @InjectModel('Grade')
    private readonly gradeModel: Model<Grade>,
  ) {}

  async run(limit = 20) {
    const data = GradeFactory.makeMany(limit);
    await this.gradeModel.insertMany(data);
    this.logger.log(`✔ Created ${limit} grades.`);
  }
}
