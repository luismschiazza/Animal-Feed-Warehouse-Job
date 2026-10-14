import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class NotOwnUserGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userId = request.params.id;

    if (user && userId && user.id === userId) {
      throw new ForbiddenException('You cannot perform this action on your own user data');
    }

    return true;
  }
}
