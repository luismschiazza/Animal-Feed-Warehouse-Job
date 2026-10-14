import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthSession, SessionRevocationReason } from '../schemas/auth-session.schema';
import { generateRefreshToken, isSessionId, parseRefreshToken } from '../tokens/refresh-token';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SESSION_ROTATIONS = 1000;

export interface SessionMetadata {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthSessionsService {
  constructor(@InjectModel(AuthSession.name) private readonly sessions: Model<AuthSession>) {}

  async create(userId: string, metadata: SessionMetadata = {}, organizationId?: string) {
    if (
      !/^[a-f0-9]{24}$/i.test(userId) ||
      (organizationId !== undefined && !/^[a-f0-9]{24}$/i.test(organizationId))
    )
      throw this.invalidSession();
    const credential = generateRefreshToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.sessions.create({
      sessionId: credential.sessionId,
      userId: new Types.ObjectId(userId),
      organizationId: organizationId === undefined ? null : new Types.ObjectId(organizationId),
      currentTokenId: credential.tokenId,
      currentTokenHash: credential.tokenHash,
      lastUsedAt: now,
      expiresAt,
      ip: metadata.ip?.slice(0, 128),
      userAgent: metadata.userAgent?.slice(0, 512),
    });
    return { sessionId: credential.sessionId, refreshToken: credential.refreshToken, expiresAt };
  }

  async findActive(sessionId: string, userId: string) {
    if (!isSessionId(sessionId) || !/^[a-f0-9]{24}$/i.test(userId)) {
      throw this.invalidSession();
    }
    const session = await this.sessions
      .findOne({ sessionId, userId: new Types.ObjectId(userId), ...this.activeFilter() })
      .exec();
    if (!session) throw this.invalidSession();
    return session;
  }

  async revoke(sessionId: string, userId: string) {
    if (!isSessionId(sessionId) || !/^[a-f0-9]{24}$/i.test(userId)) {
      throw this.invalidSession();
    }
    const result = await this.sessions
      .updateOne(
        { sessionId, userId: new Types.ObjectId(userId), ...this.activeFilter() },
        { $set: { revokedAt: new Date(), revocationReason: SessionRevocationReason.LOGOUT } },
      )
      .exec();
    if (result.modifiedCount !== 1) throw this.invalidSession();
  }

  async rotate(refreshToken: string) {
    const presented = parseRefreshToken(refreshToken);
    if (!presented) throw this.invalidSession();
    const next = generateRefreshToken(presented.sessionId);
    const now = new Date();
    // One document, one atomic compare-and-swap: consume and replace together.
    const rotated = await this.sessions
      .findOneAndUpdate(
        {
          sessionId: presented.sessionId,
          currentTokenId: presented.tokenId,
          currentTokenHash: presented.tokenHash,
          rotationVersion: { $lt: MAX_SESSION_ROTATIONS },
          ...this.activeFilter(now),
        },
        {
          $set: {
            currentTokenId: next.tokenId,
            currentTokenHash: next.tokenHash,
            lastUsedAt: now,
          },
          $inc: { rotationVersion: 1 },
          $push: {
            consumedTokens: {
              tokenId: presented.tokenId,
              tokenHash: presented.tokenHash,
              consumedAt: now,
            },
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (rotated) {
      return {
        sessionId: rotated.sessionId,
        userId: rotated.userId.toString(),
        refreshToken: next.refreshToken,
        expiresAt: rotated.expiresAt,
      };
    }

    // A failed CAS is not proof of replay. Match a consumed verifier in the DB.
    await this.sessions
      .updateOne(
        {
          sessionId: presented.sessionId,
          ...this.activeFilter(),
          consumedTokens: {
            $elemMatch: { tokenId: presented.tokenId, tokenHash: presented.tokenHash },
          },
        },
        {
          $set: { revokedAt: new Date(), revocationReason: SessionRevocationReason.REFRESH_REUSE },
        },
      )
      .exec();

    // Bound document growth without discarding evidence of consumed tokens.
    // Only the valid current credential may trigger this revocation.
    await this.sessions
      .updateOne(
        {
          sessionId: presented.sessionId,
          currentTokenId: presented.tokenId,
          currentTokenHash: presented.tokenHash,
          rotationVersion: { $gte: MAX_SESSION_ROTATIONS },
          ...this.activeFilter(),
        },
        {
          $set: { revokedAt: new Date(), revocationReason: SessionRevocationReason.ROTATION_LIMIT },
        },
      )
      .exec();
    throw this.invalidSession();
  }

  private activeFilter(now = new Date()) {
    return { revokedAt: null, expiresAt: { $gt: now } };
  }

  private invalidSession() {
    return new UnauthorizedException('Invalid or inactive session');
  }
}
