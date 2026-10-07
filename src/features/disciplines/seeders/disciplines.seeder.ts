import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DisciplineFactory } from '../factories/discipline.factory';
import { Discipline } from '../interfaces/discipline.interface';

@Injectable()
export class DisciplinesSeeder {
  private readonly logger = new Logger(DisciplinesSeeder.name);

  constructor(
    @InjectModel('Discipline')
    private readonly disciplineModel: Model<Discipline>,
  ) {}

  async run(limit?: number): Promise<void> {
    const amount = limit && limit > 0 ? limit : 25;

    const disciplines = DisciplineFactory.makeMany(amount);
    await this.disciplineModel.insertMany(disciplines);

    this.logger.log(`✔ Created ${amount} discipline(s).`);
  }
}
