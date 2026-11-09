import * as mongoose from 'mongoose';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { operate } from './demo.script';

const manager = createRequire(__filename)(path.resolve(__dirname, '../../../scripts/demo.cjs'));

describe('Demo destination guard precedes every database bootstrap', () => {
  let connection: jest.SpyInstance;
  let load: jest.SpyInstance;
  beforeEach(() => {
    connection = jest.spyOn(mongoose, 'createConnection').mockImplementation(() => {
      throw new Error('Unexpected connection');
    });
    load = jest.spyOn(manager, 'load').mockImplementation(() => {
      throw new Error('No verified disposable destination');
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it.each(['../real', '', 'mongodb://untrusted.invalid', 'UPPERCASE'])(
    'refuses invalid destination case %# without probing a database',
    async (name) => {
      await expect(operate(name, 'seed')).rejects.toThrow();
      expect(load).not.toHaveBeenCalled();
      expect(connection).not.toHaveBeenCalled();
    },
  );
  it('does not fall back to MONGO_URL if local ownership verification fails', async () => {
    const old = process.env.MONGO_URL;
    try {
      process.env.MONGO_URL = 'mongodb://never-probe.invalid:1/real';
      await expect(operate('unproven', 'seed')).rejects.toThrow('No verified disposable');
      expect(load).toHaveBeenCalledWith('unproven');
      expect(connection).not.toHaveBeenCalled();
    } finally {
      if (old === undefined) delete process.env.MONGO_URL;
      else process.env.MONGO_URL = old;
    }
  });
});
