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
      [{ $set: { sequence: { $add: ['$sequence', 1] }, serverNow: '$$NOW' } }],
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
  it.each([
    { rows: [] },
    { rows: [{ usable: false, items: [] }] },
    { rows: [{ usable: true, items: [] }] },
  ])('uses the database high-water clock and fails closed when unusable: %j', async ({ rows }) => {
    const f = fixture();
    const query = {
      read: jest.fn().mockReturnThis(),
      readConcern: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(rows),
      option: jest.fn().mockReturnThis(),
    };
    f.model.aggregate = jest.fn().mockReturnValue(query);
    if (rows[0]?.usable) await expect(f.service.readSessions([])).resolves.toEqual([]);
    else await expect(f.service.readSessions([])).rejects.toThrow('Session clock unavailable');
    expect(query.read).toHaveBeenCalledWith('primary');
    expect(query.readConcern).toHaveBeenCalledWith('snapshot');
    expect(query.option).toHaveBeenCalledWith({ maxTimeMS: 5000, timeoutMS: 10000 });
    const stages = f.model.aggregate.mock.calls[0][0];
    expect(stages[2].$lookup).toMatchObject({
      from: 'auth_sessions',
      let: { clockUsable: '$usable' },
      pipeline: [{ $match: { $expr: { $eq: ['$$clockUsable', true] } } }],
    });
  });
  it('keeps the scoped session pipeline in the same read-only snapshot without acquiring the write fence', async () => {
    const f = fixture(),
      query = {
        read: jest.fn().mockReturnThis(),
        readConcern: jest.fn().mockReturnThis(),
        option: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ usable: true, items: [{ sessionId: 'safe' }] }]),
      };
    f.model.aggregate = jest.fn().mockReturnValue(query);
    const pipeline = [{ $match: { sessionId: 'safe' } }, { $limit: 1 }];
    expect(await f.service.readSessions(pipeline)).toEqual([{ sessionId: 'safe' }]);
    expect(f.model.aggregate.mock.calls[0][0][2].$lookup.pipeline.slice(1)).toEqual(pipeline);
    expect(f.model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(f.model.db.startSession).not.toHaveBeenCalled();
    query.exec.mockRejectedValue(new Error('private URI/password'));
    await expect(f.service.readSessions(pipeline)).rejects.toThrow('Session clock unavailable');
  });
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
