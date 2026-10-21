import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AuditContext } from './audit-context.service';
import { AuditEvent } from './security-audit.schema';
import { SecurityAuditService } from './security-audit.service';

@Catch()
@Injectable()
export class SecurityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SecurityExceptionFilter.name);
  constructor(
    private readonly audit: SecurityAuditService,
    private readonly context: AuditContext,
  ) {}
  async catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest(),
      response = http.getResponse();
    if (!this.context.active()) return this.context.run(request, () => this.catch(error, host));
    response.setHeader('X-Request-Id', this.context.get().requestId);
    let status = error instanceof HttpException ? error.getStatus() : 500;
    // Includes malformed login/refresh rejected by Passport/pipes before a service executes.
    const route = request.route?.path;
    const event =
      typeof route === 'string' && route.endsWith('/auth/login')
        ? AuditEvent.LOGIN
        : typeof route === 'string' && route.endsWith('/auth/refresh')
          ? AuditEvent.REFRESH
          : AuditEvent.REQUEST;
    try {
      await this.audit.record(event, status < 500 ? 'denied' : 'error', 'http', request.user);
    } catch {
      status = 503;
    }
    // Never pass a raw exception, stack, URL, headers, body or DB diagnostics to logging.
    if (status >= 500)
      this.logger.error(
        JSON.stringify({
          event: 'request_failed',
          status,
          requestId: this.context.get().requestId,
        }),
      );
    const body =
      status < 500 && error instanceof HttpException
        ? error.getResponse()
        : {
            statusCode: status,
            message: status === 503 ? 'Security service unavailable' : 'Internal server error',
          };
    response
      .status(status)
      .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
