import { Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { LoginRequestDto } from '../dtos/validation/login-request.dto';
import { RefreshTokenRequestDto } from '../dtos/validation/refresh-token-request.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { LocalAuthGuard } from '../guards/local-auth.guard';
import { AuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Post('login')
  async login(@Body() _loginDto: LoginRequestDto, @Request() req) {
    return this.authService.login(req.user);
  }

  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenRequestDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post('logout')
  async logout(@Request() req) {
    return this.authService.logout(req.user.id);
  }
}
