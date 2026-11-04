import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { Public } from '@/common/authorization/policy.decorators';
import {
  ConfirmSessionReplacementDto,
  ListSessionReplacementDto,
  RecoverSessionReplacementDto,
  SessionReplacementDto,
  StartSessionReplacementDto,
} from '../dtos/validation/session-replacement.dto';
import { LocalAuthGuard } from '../guards/local-auth.guard';
import { SessionReplacementService } from '../services/session-replacement.service';

// A business JWT does not authorize these routes. Each has its OWN narrow credential checks.
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
  @Header('Cache-Control', 'no-store')
  @Post('start')
  start(@Body() dto: StartSessionReplacementDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.start(
      req.user,
      dto.organizationId,
      {
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
      dto.recoveryChallenge,
    );
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Post('recover')
  recover(@Body() dto: RecoverSessionReplacementDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.recover(
      req.user,
      dto.organizationId,
      dto.flowId,
      dto.recoveryVerifier,
      {
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
    );
  }

  @Public()
  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Post('sessions')
  list(@Body() dto: ListSessionReplacementDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.list(dto.replacementToken, dto.before);
  }

  @Public()
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Post('confirm')
  confirm(@Body() dto: ConfirmSessionReplacementDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.confirm(dto.replacementToken, dto.sessionId);
  }

  @Public()
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Post('cancel')
  cancel(@Body() dto: SessionReplacementDto, @Request() req) {
    this.noQuery(req);
    return this.replacement.cancel(dto.replacementToken);
  }
}
