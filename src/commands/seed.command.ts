import { Command, CommandRunner } from 'nest-commander';

@Command({ name: 'seed', description: 'Disabled legacy demonstration command' })
export class SeedCommand extends CommandRunner {
  async run(): Promise<void> {
    throw new Error('Legacy demonstration seeds are disabled; no seed was executed');
  }
}
