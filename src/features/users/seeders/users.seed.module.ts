import { Module } from '@nestjs/common';
import { UserModelModule } from '../models/user-model.module';
import { UsersSeeder } from './users.seeder';

@Module({
  imports: [UserModelModule],
  providers: [UsersSeeder],
  exports: [UsersSeeder],
})
export class UsersSeedModule {}
