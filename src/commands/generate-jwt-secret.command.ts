import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { Command, CommandRunner, Option } from 'nest-commander';
import * as path from 'path';

interface GenerateJwtSecretOptions {
  force?: boolean;
}

@Command({
  name: 'generate:jwt-secret',
  description: 'Generate a secure JWT secret and write it into the .env file',
})
export class GenerateJwtSecretCommand extends CommandRunner {
  private readonly logger = new Logger(GenerateJwtSecretCommand.name);

  async run(_: string[], options: GenerateJwtSecretOptions): Promise<void> {
    const envPath = path.resolve(process.cwd(), '.env');
    const exists = fs.existsSync(envPath);

    if (!exists) {
      this.logger.error('.env file not found at project root.');
      return;
    }

    const newSecret = crypto.randomBytes(32).toString('hex');
    const raw = fs.readFileSync(envPath, 'utf8');
    const hasKey = /JWT_SECRET=/.test(raw);
    const isEmpty = /^JWT_SECRET=\s*$/m.test(raw);

    let updated: string;

    if (hasKey && !isEmpty && !options.force) {
      this.logger.log('JWT_SECRET already exists and is not empty. Use --force to overwrite.');
      return;
    }

    if (hasKey) {
      updated = raw.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${newSecret}`);
    } else {
      updated = raw.trim() + `\nJWT_SECRET=${newSecret}\n`;
    }

    fs.writeFileSync(envPath, updated);

    this.logger.log('New JWT secret generated successfully!');
    this.logger.log('Value:');
    this.logger.log(newSecret);
  }

  @Option({
    flags: '-f, --force',
    description: 'Overwrite existing JWT_SECRET if it already exists',
  })
  parseForce(val: boolean): boolean {
    return val;
  }
}
