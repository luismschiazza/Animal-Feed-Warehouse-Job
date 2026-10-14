import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { SeedService } from '@/commands/seed/services/seed.service';

interface SeedCommandOptions {
  module?: string;
  limit?: number;
}

@Command({
  name: 'seed',
  description: 'Run database seeders',
})
export class SeedCommand extends CommandRunner {
  private readonly logger = new Logger(SeedCommand.name);
  constructor(private readonly seedService: SeedService) {
    super();
  }

  async run(_: string[], options: SeedCommandOptions): Promise<void> {
    try {
      if (!options.module) {
        this.logger.error('No module provided. Use --module <name>.');
        return;
      }

      switch (options.module) {
        case 'users':
          await this.seedService.seedUsers?.(options.limit);
          break;

        case 'disciplines':
          await this.seedService.seedDisciplines?.(options.limit);
          break;

        case 'attendances':
          await this.seedService.seedAttendances?.(options.limit);
          break;

        case 'meetings':
          await this.seedService.seedMeeting?.(options.limit);
          break;

        case 'grades':
          await this.seedService.seedGrade?.(options.limit);
          break;

        case 'mails':
          await this.seedService.seedMailer?.();
          break;

        default:
          this.logger.error(`Unknown module: ${options.module}`);
          break;
      }
    } catch (error) {
      this.logger.error('Seed command failed:', error);
    }
  }

  @Option({
    flags: '-m, --module <module>',
    description: 'Target module to seed (e.g., users, disciplines)',
  })
  parseModule(val: string): string {
    return val;
  }

  @Option({
    flags: '-l, --limit [number]',
    description: 'Limit the number of items to seed',
  })
  parseLimit(val: string): number {
    return Number(val);
  }
}
