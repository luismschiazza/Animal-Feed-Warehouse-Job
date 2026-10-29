import { SeedCommand } from '../seed.command';
import { SeedService } from './services/seed.service';

describe('Legacy seed safety — no database or mail dependencies', () => {
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
