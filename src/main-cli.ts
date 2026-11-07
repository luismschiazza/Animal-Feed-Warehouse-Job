import { CommandFactory } from 'nest-commander';
import * as path from 'node:path';

async function bootstrap() {
  if (process.argv[2] === 'seed') {
    // Reject unsafe/legacy demo requests BEFORE AppModule reads .env/MONGO_URL.
    const demo = await import(path.resolve(__dirname, '../scripts/demo.cjs'));
    await demo.main(['seed', ...process.argv.slice(3)]);
    return;
  }
  const { AppModule } = await import('./app/app.module');
  await CommandFactory.run(AppModule, ['error', 'warn', 'log']);
}

void bootstrap().catch(() => {
  console.error('CLI command failed; no credentials logged.');
  process.exitCode = 1;
});
