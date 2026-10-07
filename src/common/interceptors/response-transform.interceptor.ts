import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { originalUrl } = request;

    // Skip auth routes
    if (originalUrl.startsWith('/auth')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        payload: data,
        message: 'Request successfully processed',
      })),
    );
  }
}
