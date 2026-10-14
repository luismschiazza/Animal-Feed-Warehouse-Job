import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { User } from '../interfaces/user.interface';

@Injectable()
export class UserListener {
  private readonly logger = new Logger(UserListener.name);

  @OnEvent('user.created')
  handleUserCreated(user: User) {
    this.logger.log(`User created: ${user.email} (roles: ${user.roles.join(', ')})`);
  }
}
