import { Injectable, Logger } from '@nestjs/common';
import { AttendancesSeeder } from '@/features/attendance/seeders/attendance.seeder';
import { DisciplinesSeeder } from '@/features/disciplines/seeders/disciplines.seeder';
import { GradesSeeder } from '@/features/grades/seeders/grades.seeder';
import { MailSeed } from '@/features/mail/seeds/mail.seed';
import { MeetingsSeeder } from '@/features/meeting/seeders/meetings.seeder';
import { UsersSeeder } from '@/features/users/seeders/users.seeder';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly usersSeeder: UsersSeeder,
    private readonly disciplinesSeeder: DisciplinesSeeder,
    private readonly attendancesSeeder: AttendancesSeeder,
    private readonly meetingsSeeder: MeetingsSeeder,
    private readonly gradesSeeder: GradesSeeder,
    private readonly mailSeeder: MailSeed,
  ) {}

  async seedDisciplines(limit?: number): Promise<void> {
    await this.disciplinesSeeder.run(limit);
    this.logger.log('✔ Disciplines seeding finished.');
  }

  async seedUsers(limit?: number): Promise<void> {
    await this.usersSeeder.run(limit);
    this.logger.log('✔ Users seeding finished.');
  }

  async seedAttendances(limit?: number): Promise<void> {
    await this.attendancesSeeder.run(limit);
    this.logger.log('✔ Attendances seeding finished.');
  }

  async seedMeeting(limit?: number): Promise<void> {
    await this.meetingsSeeder.run(limit);
    this.logger.log('✔ Meeting seeding finished.');
  }

  async seedGrade(limit?: number): Promise<void> {
    await this.gradesSeeder.run(limit);
    this.logger.log('✔ Grades seeding finished.');
  }

  async seedMailer(): Promise<void> {
    await this.mailSeeder.run();
    this.logger.log('✔ Mailer seeding finished.');
  }
}
