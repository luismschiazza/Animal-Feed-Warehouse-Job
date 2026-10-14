import { Module } from '@nestjs/common';
import { GradeModelModule } from '../models/grade-model.module';
import { GradesSeeder } from './grades.seeder';

@Module({
  imports: [GradeModelModule],
  providers: [GradesSeeder],
  exports: [GradesSeeder],
})
export class GradesSeederModule {}
