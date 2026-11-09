import * as path from 'node:path';

type CliCommand = 'seed' | 'generate:jwt-secret';
type CliPlan = { kind: 'help'; command?: CliCommand } | { kind: CliCommand };
const commands = new Set<string>(['seed', 'generate:jwt-secret']);
const helpFlags = new Set(['-h', '--help']);
const refuse = (): never => {
  throw new Error('Invalid CLI invocation; use --help. No application was bootstrapped.');
};

// No Nest, ConfigModule, dotenv, application or database imports during classification.
export function classifyCli(args: readonly string[]): CliPlan {
  if (!args.length) return { kind: 'help' };
  const [command, ...rest] = args;
  if (command === 'help' || helpFlags.has(command)) {
    if (rest.length > 1 || (rest.length === 1 && !commands.has(rest[0]))) refuse();
    return { kind: 'help', command: rest[0] as CliCommand | undefined };
  }
  if (!commands.has(command)) refuse();
  // Help never executes a handler, even when accompanied by that command's options.
  if (rest.some((arg) => helpFlags.has(arg)))
    return { kind: 'help', command: command as CliCommand };
  if (command === 'seed') return { kind: 'seed' }; // manager.parse validates every seed argument
  if (rest.length > 1 || rest.some((arg) => !['-f', '--force'].includes(arg))) refuse();
  return { kind: 'generate:jwt-secret' };
}

export function cliHelp(command?: CliCommand): string {
  if (command === 'seed')
    return 'Usage: cli seed --name <owned-demo> [-m demo|users|products] [-l 21|15|6] [--dry-run]\nUse demo:create first. No arbitrary Mongo URI or application environment fallback. School/mail seeds remain disabled.';
  if (command === 'generate:jwt-secret')
    return 'Usage: cli generate:jwt-secret [-f|--force]\nWrites JWT_SECRET to the current directory .env; existing nonempty value is preserved unless force is explicit. Help never reads or changes .env.';
  return [
    'Usage: cli <command> [options]',
    '  seed --name <owned-demo>    Guarded disposable commercial demo only',
    '  generate:jwt-secret [-f|--force]    Existing local administrative secret generator',
    '  help [command] | -h | --help    Local help without application/database bootstrap',
    'Commands are case-sensitive; unknown commands/options are refused, not guessed.',
    'Independent administrative npm scripts (unchanged; not main-cli subcommands):',
    '  bootstrap:organization, audit:initialize, audit:export, products:initialize,',
    '  session-limits:initialize, session-admission:initialize, session-replacement:initialize',
  ].join('\n');
}

export async function dispatchCli(args: readonly string[]): Promise<void> {
  const plan = classifyCli(args);
  if (plan.kind === 'help') {
    console.info(cliHelp(plan.command));
    return;
  }
  if (plan.kind === 'seed') {
    const demo = await import(path.resolve(__dirname, '../../scripts/demo.cjs'));
    await demo.main(['seed', ...args.slice(1)]);
    return;
  }
  // The only Nest command accepted here needs filesystem access, not AppModule/DB/mail.
  const { CommandFactory } = await import('nest-commander');
  const { CliAdminModule } = await import('./cli-admin.module');
  await CommandFactory.run(CliAdminModule, ['error', 'warn', 'log']);
}
