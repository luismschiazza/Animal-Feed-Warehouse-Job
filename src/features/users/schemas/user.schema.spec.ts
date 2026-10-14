import { model } from 'mongoose';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { User, UserSchema } from './user.schema';

const UserModel = model<User>('AccountStatusSchemaTest', UserSchema);

describe('Account status defaults and validation', () => {
  it('defaults missing status to pending, not active, including legacy hydration', () => {
    expect(new UserModel().status).toBe(AccountStatus.PENDING);
    expect(UserModel.hydrate({ name: 'Legacy' }).status).toBe(AccountStatus.PENDING);
  });
  it('requires a known account state', () => {
    const user = new UserModel({
      name: 'User',
      email: 'test@example.com',
      password: 'hash',
      status: 'unknown',
    });
    expect(user.validateSync()?.errors).toHaveProperty('status');
  });
});
