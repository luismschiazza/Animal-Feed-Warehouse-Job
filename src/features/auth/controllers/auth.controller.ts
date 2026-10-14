import { Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { Public, RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import { LoginRequestDto } from '../dtos/validation/login-request.dto';
import { RefreshTokenRequestDto } from '../dtos/validation/refresh-token-request.dto';
import { LocalAuthGuard } from '../guards/local-auth.guard';
import { AuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Post('login')
  async login(@Body() _loginDto: LoginRequestDto, @Request() req) {
    return this.authService.login(req.user, {
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenRequestDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @RequirePolicies({ action: PolicyAction.REVOKE, resource: PolicyResource.SESSION })
  @HttpCode(200)
  @Post('logout')
  async logout(@Request() req) {
    return this.authService.logout(req.user.id, req.user.sessionId);
  }
}
