import { Document } from 'mongoose';
import { Role } from '@/common/enums/role.enum';

export interface User extends Document {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly emailVerifiedAt?: Date;
  readonly rememberToken?: string;
  readonly refreshTokenHash?: string;
  readonly roles: Role[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
