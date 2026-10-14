import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { delay } from 'rxjs/operators';

@Injectable()
export class DelayInterceptor implements NestInterceptor {
  constructor(private readonly delayMs: number) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(delay(this.delayMs));
  }
}
