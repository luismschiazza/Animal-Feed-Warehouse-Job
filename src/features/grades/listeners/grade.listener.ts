import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Discipline } from '@/features/disciplines/interfaces/discipline.interface';
import { GradeReleasedFactory } from '@/features/mail/factories/grade-released.factory';
import { MailService } from '@/features/mail/services/mail.service';
import { User } from '@/features/users/interfaces/user.interface';
import { Grade } from '../interfaces/grade.interface';

@Injectable()
export class GradeListener {
  private readonly logger = new Logger(GradeListener.name);

  constructor(
    @InjectModel('User')
    private readonly userModel: Model<User>,

    @InjectModel('Discipline')
    private readonly disciplineModel: Model<Discipline>,

    private readonly mailer: MailService,
  ) {}

  @OnEvent('grade.created')
  async handleGradeCreated(grade: Grade) {
    const student = await this.userModel.findById(grade.student);
    const discipline = await this.disciplineModel.findById(grade.discipline);

    if (!student || !discipline) return;

    const payload = GradeReleasedFactory.create(
      student.email,
      student.name,
      discipline.name,
      grade.value,
      grade.type,
      grade.term,
      grade.comments,
    );

    await this.mailer.send(payload);

    this.logger.log(`Grade release email sent → ${student.email}`);
  }
}
