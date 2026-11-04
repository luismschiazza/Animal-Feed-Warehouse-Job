import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { Public } from '@/common/authorization/policy.decorators';
import { LoginRequestDto } from '../dtos/validation/login-request.dto';
import {
  ConfirmSessionReplacementDto,
  ListSessionReplacementDto,
  SessionReplacementDto,
} from '../dtos/validation/session-replacement.dto';
import { LocalAuthGuard } from '../guards/local-auth.guard';
import { SessionReplacementService } from '../services/session-replacement.service';

// No business JWT exists yet. These four exceptions have their OWN narrow credential checks.
// Capability stays in POST body, never URL/query/access-log path.
@Controller('auth/session-replacement')
export class SessionReplacementController {
  constructor(private readonly replacement: SessionReplacementService) {}

  private noQuery(req) {
    if (Object.keys(req.query ?? {}).length)
      throw new BadRequestException('Unexpected replacement query parameters');
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Post('start')
  start(@Body() dto: LoginRequestDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.start(req.user, dto.organizationId, {
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Public()
  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @HttpCode(200)
  @Post('sessions')
  list(@Body() dto: ListSessionReplacementDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.list(dto.replacementToken, dto.before);
  }

  @Public()
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @HttpCode(200)
  @Post('confirm')
  confirm(@Body() dto: ConfirmSessionReplacementDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.confirm(dto.replacementToken, dto.sessionId);
  }

  @Public()
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @HttpCode(200)
  @Post('cancel')
  cancel(@Body() dto: SessionReplacementDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.cancel(dto.replacementToken);
  }
}
