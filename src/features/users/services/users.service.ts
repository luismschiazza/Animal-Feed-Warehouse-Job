import { ForbiddenException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { CreateUserDto } from '../dtos/validation/create-user.dto';
import { UpdateUserDto } from '../dtos/validation/update-user.dto';
import { User } from '../interfaces/user.interface';

const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User')
    private userModel: Model<User>,
    private eventEmitter: EventEmitter2,
    private readonly resources: ScopedResourcesService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, PASSWORD_SALT_ROUNDS);
    const createdUser = new this.userModel({
      name: createUserDto.name,
      email: createUserDto.email,
      password: hashedPassword,
      roles: [Role.CUSTOMER],
      // Public registration permits a personal account, never organization membership.
      status: AccountStatus.ACTIVE,
    });

    const saved = await createdUser.save();

    this.eventEmitter.emit('user.created', saved);

    return saved;
  }

  async findAll(actor: PolicySubject) {
    return this.resources.list(PolicyResource.USER, actor);
  }

  async findScopedAccount(id: string, actor: PolicySubject) {
    return this.resources.get(PolicyResource.USER, id, actor);
  }

  // Global identity readers below are exclusively for authentication/registration.
  // Operational controllers must use the scoped methods above.

  async findOneByEmail(email: string): Promise<User> {
    return this.userModel.findOne({ email: email.trim().toLowerCase() }).exec();
  }

  async findOneByEmailWithPassword(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+password +roles')
      .exec();
  }

  async findOneById(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('+roles').exec();
  }

  async update(_id: string, _updateUserDto: UpdateUserDto): Promise<User | null> {
    void _id;
    void _updateUserDto;
    throw new ForbiddenException('Tenant administrators cannot change global accounts');
  }

  async delete(_id: string): Promise<User | null> {
    void _id;
    throw new ForbiddenException('Tenant administrators cannot delete global accounts');
  }
}
