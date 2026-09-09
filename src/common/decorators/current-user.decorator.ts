import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const user = req.user;

    if (!user) return undefined;

    return data ? user[data] : user;
  },
);
