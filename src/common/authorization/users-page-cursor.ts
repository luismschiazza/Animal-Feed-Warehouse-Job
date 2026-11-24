import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const USERS_PAGE_CURSOR_PATTERN = /^v1\.[a-f0-9]{24}\.[a-f0-9]{64}$/;

function signature(secret: string, organizationId: string, actorId: string, position: string) {
  const key = createHmac('sha256', secret).update('afw/users-page/cursor-key').digest();
  return createHmac('sha256', key)
    .update(
      JSON.stringify([
        'v1',
        'active-accounts-and-memberships:userId-asc',
        organizationId,
        actorId,
        position,
      ]),
    )
    .digest();
}

export function encodeUsersPageCursor(
  secret: string,
  organizationId: string,
  actorId: string,
  position: string,
): string {
  return `v1.${position}.${signature(secret, organizationId, actorId, position).toString('hex')}`;
}

export function decodeUsersPageCursor(
  secret: string,
  organizationId: string,
  actorId: string,
  cursor: string,
): string {
  if (typeof cursor !== 'string' || cursor.length !== 92 || !USERS_PAGE_CURSOR_PATTERN.test(cursor))
    throw new BadRequestException('Invalid users page cursor');
  const [, position, mac] = cursor.split('.');
  if (
    !timingSafeEqual(Buffer.from(mac, 'hex'), signature(secret, organizationId, actorId, position))
  )
    throw new BadRequestException('Invalid users page cursor');
  return position;
}
