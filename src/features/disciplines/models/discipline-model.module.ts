import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Discipline, DisciplineSchema } from '../schemas/discipline.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Discipline.name, schema: DisciplineSchema }])],
  exports: [MongooseModule],
})
export class DisciplineModelModule {}
