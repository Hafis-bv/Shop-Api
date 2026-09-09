import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Request } from 'express';

const OPTIONAL_AUTH = Symbol('optionalAuth');

type OptionalRequest = Request & { [OPTIONAL_AUTH]?: boolean };

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
  ): TUser {
    if (err || !user) {
      const reason =
        info instanceof Error ? `${info.name}: ${info.message}` : info;
      this.logger.warn(`JWT auth failed: ${reason ?? 'no user/token'}`);
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    return user;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      const req = context.switchToHttp().getRequest<OptionalRequest>();

      req[OPTIONAL_AUTH] = true;

      try {
        await super.canActivate(context);
      } catch (err) {
        console.log(err);
      }
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}
