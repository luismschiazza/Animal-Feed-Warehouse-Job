import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Role } from '@/common/enums/role.enum';
import { UsersService } from '@/features/users/services/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
}

const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TOKEN_SALT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersService.findOneByEmailWithPassword(normalizedEmail);
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles as Role[],
    };
  }

  async validateUserById(userId: string) {
    return await this.usersService.findOneById(userId);
  }

  async login(user: AuthenticatedUser) {
    return this.issueTokenPair(user);
  }

  async refresh(refreshToken: string) {
    const decodedRefreshToken = this.decodeRefreshToken(refreshToken);
    if (!decodedRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (decodedRefreshToken.expiresAt <= Date.now()) {
      await this.usersService.clearRefreshTokenHash(decodedRefreshToken.userId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findOneByIdWithRefreshTokenHash(
      decodedRefreshToken.userId,
    );
    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokenPair({
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles as Role[],
    });
  }

  async logout(userId: string) {
    await this.usersService.clearRefreshTokenHash(userId);
    return { message: 'Logged out successfully' };
  }

  private async issueTokenPair(user: AuthenticatedUser) {
    const payload: JwtPayload = { email: user.email, sub: user.id, roles: user.roles };

    const accessToken = this.jwtService.sign(payload);
    const decoded = this.jwtService.decode(accessToken) as { exp?: number };

    const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : null;
    const refreshToken = this.generateRefreshToken(user.id);
    const refreshTokenHash = await bcrypt.hash(refreshToken, REFRESH_TOKEN_SALT_ROUNDS);

    await this.usersService.updateRefreshTokenHash(user.id, refreshTokenHash);

    return {
      token_type: 'Bearer',
      expires_in: expiresIn,
      access_token: accessToken,
      refresh_token: refreshToken,
      accessToken,
      refreshToken,
    };
  }

  private generateRefreshToken(userId: string) {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresAt = Date.now() + REFRESH_TOKEN_TTL_MS;
    return `${userId}.${expiresAt}.${token}`;
  }

  private decodeRefreshToken(refreshToken: string) {
    const [userId, expiresAt, token] = refreshToken.split('.');
    const expiresAtTimestamp = Number(expiresAt);

    if (!userId || !expiresAt || !token || Number.isNaN(expiresAtTimestamp)) {
      return null;
    }
    return { userId, expiresAt: expiresAtTimestamp };
  }
}
