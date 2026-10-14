import { Module } from '@nestjs/common';
import { DisciplineModelModule } from '../models/discipline-model.module';
import { DisciplinesSeeder } from './disciplines.seeder';

@Module({
  imports: [DisciplineModelModule],
  providers: [DisciplinesSeeder],
  exports: [DisciplinesSeeder],
})
export class DisciplinesSeedModule {}
