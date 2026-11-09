import { AttendancesSeeder } from '@/features/attendance/seeders/attendance.seeder';
import { DisciplinesSeeder } from '@/features/disciplines/seeders/disciplines.seeder';
import { GradesSeeder } from '@/features/grades/seeders/grades.seeder';
import { MailSeed } from '@/features/mail/seeds/mail.seed';
import { MeetingsSeeder } from '@/features/meeting/seeders/meetings.seeder';
import { UsersSeeder } from '@/features/users/seeders/users.seeder';
import { SeedCommand } from '../seed.command';
import { SeedService } from './services/seed.service';

// Faker is an unused legacy ESM dependency here; any factory access must fail,
// rather than changing Jest transforms or weakening the existing unit-test gate.
jest.mock('@faker-js/faker', () => ({
  faker: new Proxy(
    {},
    {
      get: () => {
        throw new Error('Disabled legacy factory was accessed');
      },
    },
  ),
}));

describe('Legacy seed safety — no database or mail dependencies', () => {
  it.each([
    UsersSeeder,
    DisciplinesSeeder,
    AttendancesSeeder,
    GradesSeeder,
    MeetingsSeeder,
    MailSeed,
  ])(
    'rejects the individual %p provider BEFORE accessing Mongo, factories or SMTP',
    async (Provider) => {
      const dependency = new Proxy(
        {},
        {
          get: () => {
            throw new Error('Legacy provider touched a dependency');
          },
        },
      );
      await expect(new (Provider as any)(dependency).run()).rejects.toThrow('disabled');
    },
  );
  it('rejects the CLI command instead of silently succeeding', async () => {
    await expect(new SeedCommand().run()).rejects.toThrow('disabled');
  });
  it.each([
    'seedUsers',
    'seedDisciplines',
    'seedAttendances',
    'seedMeeting',
    'seedGrade',
    'seedMailer',
  ] as const)('rejects direct %s calls in every environment', async (method) => {
    await expect(new SeedService()[method]()).rejects.toThrow('disabled');
  });
});
