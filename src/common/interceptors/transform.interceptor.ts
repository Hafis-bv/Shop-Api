import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';
import { Request, Response } from 'express';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  path: string;
  timestamp: string;
  data: T;
  meta?: Record<string, unknown>;
}

export interface Paginated<T> {
  data: T;
  meta: Record<string, unknown>;
}

function isPaginated<T>(value: unknown): value is Paginated<T> {
  return (
    typeof value == 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    Object.keys(value).length == 2
  );
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TRANSFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((payload): ApiResponse<T> => {
        const envelope: ApiResponse<T> = {
          success: true,
          statusCode: res.statusCode,
          path: req.url,
          timestamp: new Date().toISOString(),
          data: (isPaginated(payload) ? payload.data : payload) as T,
        };
        if (isPaginated(payload)) {
          envelope.meta = payload.meta;
        }

        return envelope;
      }),
    );
  }
}
