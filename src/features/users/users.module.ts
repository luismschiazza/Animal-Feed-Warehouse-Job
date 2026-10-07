import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UsersController } from './controllers/users.controller';
import { ExcludeOwnUserGuard } from './guards/exclude-own-user.guard';
import { NotOwnUserGuard } from './guards/not-own-user.guard';
import { UserListener } from './listeners/user.listener';
import { UserModelModule } from './models/user-model.module';
import { UsersService } from './services/users.service';
import { UniqueEmailValidator } from './validators/unique-email.validator';

@Module({
  imports: [UserModelModule, MailModule],
  providers: [
    UsersService,
    UniqueEmailValidator,
    NotOwnUserGuard,
    ExcludeOwnUserGuard,
    UserListener,
  ],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
