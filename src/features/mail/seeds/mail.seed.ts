import { Injectable, Logger } from '@nestjs/common';
import { AttendanceLowFactory } from '../factories/attendance-low.factory';
import { GradeReleasedFactory } from '../factories/grade-released.factory';
import { MeetingScheduledFactory } from '../factories/meeting-scheduled.factory';
import { WelcomeStudentFactory } from '../factories/welcome-student.factory';
import { WelcomeTeacherFactory } from '../factories/welcome-teacher.factory';
import { MailService } from '../services/mail.service';

@Injectable()
export class MailSeed {
  private readonly logger = new Logger(MailSeed.name);

  private TEST_EMAIL = process.env.MAIL_TEST_ADDRESS;

  constructor(private readonly mailer: MailService) {}

  async run(): Promise<void> {
    this.logger.log('Running Mailer Seeder (Rendering test emails)…');

    const commonName = 'John Test';

    const samples = [
      WelcomeStudentFactory.create(this.TEST_EMAIL, commonName, '123456'),
      WelcomeTeacherFactory.create(this.TEST_EMAIL, 'Professor ' + commonName),
      GradeReleasedFactory.create(
        this.TEST_EMAIL,
        commonName,
        'Mathematics',
        9.5,
        'EXAM',
        'BIM1',
        'Good work!',
      ),
      AttendanceLowFactory.create(this.TEST_EMAIL, commonName, 'History', 62.5, '2025-11-30'),
      MeetingScheduledFactory.create(
        this.TEST_EMAIL,
        commonName,
        'Parent-Teacher Meeting',
        'Discussion about student performance.',
        '2025-12-01 14:00',
        '2025-12-01 15:00',
      ),
    ];

    for (const sample of samples) {
      await this.mailer.send(sample);
      this.logger.log(`✔ Template tested: ${sample.subject}`);
    }

    this.logger.log('Mailer seeding finished.');
  }
}
