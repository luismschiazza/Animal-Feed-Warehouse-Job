import * as bcrypt from 'bcryptjs';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { AuthService } from './auth.service';

describe('password-authenticated replacement provenance', () => {
  async function fixture() {
    const account = {
      id: '123456789012345678901234',
      email: 'disposable@example.test',
      name: 'Disposable',
      password: await bcrypt.hash('fixture-only-password', 4),
      status: AccountStatus.ACTIVE,
    };
    const users = {
      findOneByEmailWithPassword: jest.fn().mockResolvedValue(account),
      findOneByIdWithPassword: jest.fn().mockResolvedValue(account),
    };
    const access = {
      userId: account.id,
      organizationId: '223456789012345678901234',
      membershipId: '323456789012345678901234',
      roles: [Role.CUSTOMER],
    };
    const organizations = { requireActiveMembership: jest.fn().mockResolvedValue(access) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    return {
      account,
      users,
      organizations,
      service: new AuthService(
        users as any,
        {} as any,
        {} as any,
        organizations as any,
        audit as any,
      ),
    };
  }
  it('does not serialize provenance and refuses DTO/JWT-shaped copies or identity substitution', async () => {
    const { account, service } = await fixture();
    const identity = await service.validateUser(account.email, 'fixture-only-password');
    expect(service.replacementLoginProof(identity)).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(identity);
    expect(serialized).not.toContain(account.password);
    expect(serialized).not.toContain(service.replacementLoginProof(identity));
    expect(() => service.replacementLoginProof(JSON.parse(serialized))).toThrow(
      'Password proof required',
    );
    expect(() => service.replacementLoginProof({ ...identity })).toThrow('Password proof required');
    identity.id = '423456789012345678901234';
    expect(() => service.replacementLoginProof(identity)).toThrow('Password proof required');
  });
  it('rechecks password/context using the supplied transaction; fabricated proof and recreated membership fail closed', async () => {
    const { account, users, organizations, service } = await fixture();
    const identity = await service.validateUser(account.email, 'fixture-only-password');
    const proof = service.replacementLoginProof(identity),
      session = {} as any;
    const result = await service.requireReplacementIdentity(
      account.id,
      '223456789012345678901234',
      proof,
      '323456789012345678901234',
      session,
    );
    expect(result.roles).toEqual([Role.CUSTOMER]);
    expect(users.findOneByIdWithPassword).toHaveBeenCalledWith(account.id, session);
    expect(organizations.requireActiveMembership).toHaveBeenCalledWith(
      account.id,
      '223456789012345678901234',
      session,
    );
    await expect(
      service.requireReplacementIdentity(account.id, '223456789012345678901234', '0'.repeat(64)),
    ).rejects.toThrow('Invalid replacement context');
    await expect(
      service.requireReplacementIdentity(
        account.id,
        '223456789012345678901234',
        proof,
        '423456789012345678901234',
      ),
    ).rejects.toThrow('Invalid replacement context');
  });
});
