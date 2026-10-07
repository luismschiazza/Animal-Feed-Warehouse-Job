import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { UserFactory } from '../factories/user.factory';
import { User } from '../interfaces/user.interface';

@Injectable()
export class UsersSeeder {
  private readonly logger = new Logger(UsersSeeder.name);

  constructor(
    @InjectModel('User')
    private readonly userModel: Model<User>,
  ) {}

  async run(limit?: number): Promise<void> {
    // Wildcard user
    const wildcardUserEmail = 'developer@example.com';
    const wildcardUserPassword = 'dev123';

    const existingUser = await this.userModel.findOne({ email: wildcardUserEmail }).exec();

    if (!existingUser) {
      await this.userModel.create({
        name: 'Wildcard User',
        email: wildcardUserEmail,
        password: await bcrypt.hash(wildcardUserPassword, 10),
        roles: ['ADMIN'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.logger.log(`Created wildcard user: ${wildcardUserEmail} / ${wildcardUserPassword}`);
    } else {
      this.logger.log(`Wildcard user already exists: ${wildcardUserEmail}`);
    }

    const amount = limit && limit > 0 ? limit : 25;
    const users = await Promise.all(
      UserFactory.makeMany(amount).map(async (user) => ({
        ...user,
        password: await bcrypt.hash(user.password, 10),
      })),
    );
    await this.userModel.insertMany(users);

    this.logger.log(`✔ Created ${amount} user(s).`);
  }
}
