import { Module } from '@nestjs/common';
import { DisciplinesController } from './controllers/disciplines.controller';
import { DisciplineModelModule } from './models/discipline-model.module';
import { DisciplinesService } from './services/disciplines.service';

@Module({
  imports: [DisciplineModelModule],
  controllers: [DisciplinesController],
  providers: [DisciplinesService],
  exports: [DisciplinesService],
})
export class DisciplinesModule {}
