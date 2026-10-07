import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
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
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, PASSWORD_SALT_ROUNDS);
    const createdUser = new this.userModel({
      name: createUserDto.name,
      email: createUserDto.email,
      password: hashedPassword,
      roles: [Role.STUDENT],
    });

    const saved = await createdUser.save();

    this.eventEmitter.emit('user.created', saved);

    return saved;
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

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

  async findOneByIdWithRefreshTokenHash(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('+roles +refreshTokenHash').exec();
  }

  async updateRefreshTokenHash(id: string, refreshTokenHash: string): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(id, { refreshTokenHash }, { new: true }).exec();
  }

  async clearRefreshTokenHash(id: string): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(id, { $unset: { refreshTokenHash: '' } }, { new: true })
      .exec();
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User | null> {
    const existingUser = await this.findOneById(id);
    if (!existingUser) {
      return null;
    }
    const updatePayload = { ...updateUserDto };
    if (updatePayload.password) {
      updatePayload.password = await bcrypt.hash(updatePayload.password, PASSWORD_SALT_ROUNDS);
    }
    return this.userModel.findByIdAndUpdate(id, updatePayload, { new: true }).exec();
  }

  async delete(id: string): Promise<User | null> {
    const existingUser = await this.findOneById(id);
    if (!existingUser) {
      return null;
    }
    return this.userModel.findByIdAndDelete(id).exec();
  }
}
