import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly authService: AuthService;

  constructor(authService: AuthService, configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret || jwtSecret === 'change_me') {
      throw new Error('JWT_SECRET must be configured with a strong secret');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
    this.authService = authService;
  }

  async validate(payload: JwtPayload) {
    if (!payload || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new UnauthorizedException('Session-bound token required');
    }
    const user = await this.authService.validateSession(payload.sub, payload.sid);
    return {
      id: user.id,
      sessionId: payload.sid,
      email: user.email,
      name: user.name,
      roles: user.roles,
    };
  }
}
