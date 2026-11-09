import { dispatchCli } from './commands/cli-dispatch';

void dispatchCli(process.argv.slice(2)).catch(() => {
  console.error('CLI command failed; use --help. No credentials logged.');
  process.exitCode = 1;
});
