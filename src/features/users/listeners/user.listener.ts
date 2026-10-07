import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Role } from '@/common/enums/role.enum';
import { WelcomeStudentFactory } from '@/features/mail/factories/welcome-student.factory';
import { WelcomeTeacherFactory } from '@/features/mail/factories/welcome-teacher.factory';
import { MailService } from '@/features/mail/services/mail.service';
import { User } from '../interfaces/user.interface';

@Injectable()
export class UserListener {
  private readonly logger = new Logger(UserListener.name);

  constructor(private readonly mailer: MailService) {}

  @OnEvent('user.created')
  async handleUserCreated(user: User) {
    let payload = null;

    if (user.roles.includes(Role.STUDENT)) {
      payload = WelcomeStudentFactory.create(user.email, user.name);
    }

    if (user.roles.includes(Role.TEACHER)) {
      payload = WelcomeTeacherFactory.create(user.email, user.name);
    }

    if (!payload) return;

    await this.mailer.send(payload);

    this.logger.log(`Welcome email sent to ${user.email} (roles: ${user.roles.join(', ')})`);
  }
}
