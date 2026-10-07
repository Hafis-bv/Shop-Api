import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user';

@Injectable()
export class LoggingInterceptor<T> implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<T> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const { method, url } = request;

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const { statusCode } = http.getResponse<Response>();
          const actor = request.user ? `user=${request.user.id}` : 'Anonymous';

          this.logger.log(
            `${method} ${url} ${statusCode} ${Date.now() - startedAt}ms ${actor}`,
          );
        },
        error: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'unknown';

          this.logger.warn(
            `${method} ${url} FAILED ${Date.now() - startedAt}ms - ${message}`,
          );
        },
      }),
    );
  }
}
