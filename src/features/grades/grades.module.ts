import { Module } from '@nestjs/common';
import { DisciplineModelModule } from '../disciplines/models/discipline-model.module';
import { MailModule } from '../mail/mail.module';
import { UserModelModule } from '../users/models/user-model.module';
import { GradesController } from './controllers/grades.controller';
import { GradeListener } from './listeners/grade.listener';
import { GradeModelModule } from './models/grade-model.module';
import { GradesSeeder } from './seeders/grades.seeder';
import { GradesService } from './services/grades.service';

@Module({
  imports: [GradeModelModule, MailModule, DisciplineModelModule, UserModelModule],
  controllers: [GradesController],
  providers: [GradesService, GradesSeeder, GradeListener],
  exports: [GradesService],
})
export class GradesModule {}
