import { classifyCli, cliHelp } from './cli-dispatch';

describe('CLI classification before bootstrap', () => {
  it.each([
    [],
    ['help'],
    ['-h'],
    ['--help'],
    ['help', 'seed'],
    ['--help', 'seed'],
    ['-h', 'seed'],
    ['seed', '--help'],
    ['seed', '--name', 'loja', '-h'],
    ['generate:jwt-secret', '--force', '--help'],
    ['help', 'generate:jwt-secret'],
  ])('classifies local help %# without running commands', (...args: string[]) => {
    expect(classifyCli(args).kind).toBe('help');
  });
  it.each([
    ['Seed'],
    ['SEED'],
    ['Seed', '--help'],
    ['--name', 'loja', 'seed'],
    ['--', 'seed'],
    ['unknown'],
    ['help', 'unknown'],
    ['--help', 'unknown'],
    ['--help', 'seed', 'extra'],
    ['help', 'seed', 'extra'],
    ['generate:jwt-secret', '--unknown'],
    ['generate:jwt-secret', 'extra'],
    ['generate:jwt-secret', '--force=true'],
    ['generate:jwt-secret', '-f', '--force'],
  ])('refuses unknown/ambiguous invocation %# before loading providers', (...args: string[]) => {
    expect(() => classifyCli(args)).toThrow('Invalid CLI');
  });
  it.each([[], ['-f'], ['--force']])(
    'preserves the explicit administrative command %#',
    (...args: string[]) => {
      expect(classifyCli(['generate:jwt-secret', ...args])).toEqual({
        kind: 'generate:jwt-secret',
      });
    },
  );
  it('delegates only the exact seed command to the guarded manager', () => {
    expect(classifyCli(['seed', '--name', 'loja'])).toEqual({ kind: 'seed' });
  });
  it('documents all existing independent administrative scripts without claiming CLI aliases', () => {
    const help = cliHelp();
    for (const name of [
      'bootstrap:organization',
      'audit:initialize',
      'audit:export',
      'products:initialize',
      'session-limits:initialize',
      'session-admission:initialize',
      'session-replacement:initialize',
    ]) {
      expect(help).toContain(name);
      expect(() => classifyCli([name])).toThrow();
    }
    expect(cliHelp('seed')).toContain('--name');
    expect(cliHelp('generate:jwt-secret')).toContain('--force');
  });
});
