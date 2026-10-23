import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  SESSION_TRANSACTION_TIMEOUT_MS,
  SessionSerializationService,
} from './session-serialization.service';

describe('Session serialization — driver contracts, not concurrency proof', () => {
  function fixture(row: any = { sequence: 1, serverNow: new Date() }) {
    const tx: any = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const exec = jest.fn().mockResolvedValue(row);
    const model: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => ({ exec }) }),
      db: {
        startSession: jest.fn().mockResolvedValue(tx),
        db: { admin: () => ({ command: async () => ({}) }) },
      },
    };
    return { service: new SessionSerializationService(model), tx, model, exec };
  }
  it('writes shared metadata first, passes database clock/ordering and uses bounded snapshot/majority transactions', async () => {
    const f = fixture(),
      work = jest.fn(async () => 42);
    expect(await f.service.run(work)).toBe(42);
    expect(f.model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'animal-feed-warehouse' }),
      { $inc: { sequence: 1 }, $currentDate: { serverNow: true } },
      expect.objectContaining({ session: f.tx, new: true, maxTimeMS: 5000 }),
    );
    expect(work).toHaveBeenCalledWith(f.tx, expect.any(Date), 1);
    expect(f.tx.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        timeoutMS: SESSION_TRANSACTION_TIMEOUT_MS,
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      }),
    );
    expect(f.tx.endSession).toHaveBeenCalledTimes(1);
  });
  it.each([
    null,
    { sequence: 1.5, serverNow: new Date() },
    { sequence: 0, serverNow: new Date() },
    { sequence: 1, serverNow: 'forged' },
    { sequence: 1, serverNow: new Date(NaN) },
  ])('fails closed before work for malformed metadata %j', async (row) => {
    const f = fixture(row),
      work = jest.fn();
    await expect(f.service.run(work)).rejects.toThrow(ServiceUnavailableException);
    expect(work).not.toHaveBeenCalled();
    expect(f.tx.endSession).toHaveBeenCalled();
  });
  it('preserves domain denial, hides infrastructure details and cleans up on failures', async () => {
    const f = fixture();
    await expect(
      f.service.run(async () => {
        throw new ConflictException('Session limit reached');
      }),
    ).rejects.toThrow(ConflictException);
    f.exec.mockRejectedValue(new Error('private URI/password'));
    await expect(f.service.run(jest.fn())).rejects.toThrow('Session coordination unavailable');
    expect(f.tx.endSession).toHaveBeenCalledTimes(2);
  });
  it.each([{ rows: [] }, { rows: [{ usable: false }] }, { rows: [{ usable: true }] }])(
    'uses the database high-water clock and fails closed when unusable: %j',
    async ({ rows }) => {
      const f = fixture();
      const query = {
        read: jest.fn().mockReturnThis(),
        readConcern: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(rows),
      };
      f.model.aggregate = jest.fn().mockReturnValue(query);
      if (rows[0]?.usable) await expect(f.service.assertClock()).resolves.toBeUndefined();
      else await expect(f.service.assertClock()).rejects.toThrow('Session clock unavailable');
      expect(query.read).toHaveBeenCalledWith('primary');
      expect(query.readConcern).toHaveBeenCalledWith('majority');
    },
  );
  it('sanitizes failures starting a driver session without attempting work or masking the error with cleanup', async () => {
    const f = fixture(),
      work = jest.fn();
    f.model.db.startSession.mockRejectedValue(new Error('private URI/password'));
    await expect(f.service.run(work)).rejects.toThrow('Session coordination unavailable');
    expect(work).not.toHaveBeenCalled();
    expect(f.tx.endSession).not.toHaveBeenCalled();
  });
  it('rejects standalone topology explicitly instead of falling back to count+insert', async () => {
    await expect(fixture().service.onModuleInit()).rejects.toThrow('replica set');
  });
});
