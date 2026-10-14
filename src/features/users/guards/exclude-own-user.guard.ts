import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../services/users.service';

@Injectable()
export class ExcludeOwnUserGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const users = await this.usersService.findAll();
    request.filteredUsers = users.filter((user) => user.id !== request.user.id);
    return true;
  }
}
