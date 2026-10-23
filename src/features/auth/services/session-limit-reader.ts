import { ServiceUnavailableException } from '@nestjs/common';
import { ClientSession, Model, Types } from 'mongoose';
import {
  DEFAULT_ORGANIZATION_SESSION_LIMIT,
  MAX_ORGANIZATION_SESSION_LIMIT,
  MAX_SESSION_LIMIT_VERSION,
  SESSION_LIMIT_APPLICATION,
  SessionLimitRevision,
} from '../schemas/session-limit-revision.schema';

// Internal consumer: admission needs no administrative role to read its verified tenant's quota.
export async function readOrganizationSessionLimit(
  revisions: Model<SessionLimitRevision>,
  organizationId: string,
  session?: ClientSession,
) {
  const query = revisions
    .findOne({
      applicationId: SESSION_LIMIT_APPLICATION,
      organizationId: new Types.ObjectId(organizationId),
    })
    .sort({ version: -1 })
    .read('primary');
  if (session) query.session(session);
  else query.readConcern('majority');
  const row = await query.lean().exec();
  if (!row) return { limit: DEFAULT_ORGANIZATION_SESSION_LIMIT, version: 0 };
  if (
    !Number.isInteger(row.limit) ||
    row.limit < 1 ||
    row.limit > MAX_ORGANIZATION_SESSION_LIMIT ||
    !Number.isInteger(row.version) ||
    row.version < 1 ||
    row.version > MAX_SESSION_LIMIT_VERSION
  )
    throw new ServiceUnavailableException('Session limit configuration unavailable');
  return { limit: row.limit, version: row.version };
}
