import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

@Injectable()
export class AuditContext {
  private readonly storage = new AsyncLocalStorage<{
    requestId: string;
    method?: string;
    ip?: string;
  }>();
  active() {
    return !!this.storage.getStore();
  }
  run<T>(request: { method?: string; ip?: string }, next: () => T): T {
    const requestId = randomUUID();
    const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(
      request.method ?? '',
    )
      ? request.method
      : undefined;
    const ip = typeof request.ip === 'string' && isIP(request.ip) ? request.ip : undefined;
    return this.storage.run({ requestId, method, ip }, next);
  }
  get() {
    return this.storage.getStore() ?? { requestId: randomUUID() };
  }
}
@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  constructor(private readonly context: AuditContext) {}
  use(req, res, next: () => void) {
    this.context.run(req, () => {
      res.setHeader('X-Request-Id', this.context.get().requestId);
      next();
    });
  }
}
