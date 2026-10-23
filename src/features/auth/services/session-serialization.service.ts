import {
  HttpException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { verifyAuditIndexes } from '@/common/audit/audit-indexes';
import { SESSION_LIMIT_APPLICATION } from '../schemas/session-limit-revision.schema';
import { SessionSerialization } from '../schemas/session-serialization.schema';

export const SESSION_TRANSACTION_TIMEOUT_MS = 10_000;

@Injectable()
export class SessionSerializationService implements OnModuleInit {
  constructor(
    @InjectModel(SessionSerialization.name) private readonly fence: Model<SessionSerialization>,
  ) {}

  async onModuleInit() {
    const hello = await this.fence.db.db.admin().command({ hello: 1 });
    if (typeof hello.setName !== 'string')
      throw new Error('Atomic session admission requires a MongoDB replica set');
    await verifyAuditIndexes(this.fence);
    const row = await this.fence.findById(SESSION_LIMIT_APPLICATION).lean().exec();
    if (
      !row ||
      !Number.isSafeInteger(row.sequence) ||
      row.sequence < 0 ||
      !(row.serverNow instanceof Date) ||
      !Number.isFinite(row.serverNow.getTime())
    )
      throw new Error('Session serialization must be initialized by the operator');
  }

  // A persisted high-water mark prevents clock rollback from reviving expired sessions
  // while admitting replacements. No local wall-clock/cache is authoritative.
  async assertClock() {
    try {
      const [row] = await this.fence
        .aggregate<{ usable: boolean }>([
          { $match: { _id: SESSION_LIMIT_APPLICATION } },
          {
            $project: {
              usable: {
                $and: [
                  { $eq: [{ $type: '$serverNow' }, 'date'] },
                  { $gte: ['$$NOW', '$serverNow'] },
                ],
              },
            },
          },
        ])
        .read('primary')
        .readConcern('majority')
        .exec();
      if (!row?.usable) throw new Error('Clock regression or missing metadata');
    } catch {
      throw new ServiceUnavailableException('Session clock unavailable');
    }
  }

  async run<T>(
    work: (session: ClientSession, serverNow: Date, sequence: number) => Promise<T>,
  ): Promise<T> {
    let session: ClientSession;
    try {
      session = await this.fence.db.startSession();
      return await session.withTransaction(
        async () => {
          // FIRST operation: write conflict forces a fresh transaction snapshot on retry.
          const row = await this.fence
            .findOneAndUpdate(
              {
                _id: SESSION_LIMIT_APPLICATION,
                sequence: { $gte: 0, $lt: Number.MAX_SAFE_INTEGER },
                $expr: { $gte: ['$$NOW', '$serverNow'] },
              },
              { $inc: { sequence: 1 }, $currentDate: { serverNow: true } },
              { session, new: true, maxTimeMS: 5_000 },
            )
            .lean()
            .exec();
          if (
            !row ||
            !Number.isSafeInteger(row.sequence) ||
            row.sequence < 1 ||
            !(row.serverNow instanceof Date) ||
            !Number.isFinite(row.serverNow.getTime())
          )
            throw new ServiceUnavailableException('Session coordination unavailable');
          return work(session, row.serverNow, row.sequence);
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority', j: true },
          readPreference: 'primary',
          timeoutMS: SESSION_TRANSACTION_TIMEOUT_MS,
          maxCommitTimeMS: 5_000,
        },
      );
    } catch (error) {
      if (error instanceof HttpException || (error as { code?: number })?.code === 11000)
        throw error;
      throw new ServiceUnavailableException('Session coordination unavailable');
    } finally {
      if (session) await session.endSession().catch(() => undefined);
    }
  }
}
