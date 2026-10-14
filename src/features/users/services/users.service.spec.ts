import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockUserModel = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  });

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken('User'),
          useValue: mockUserModel,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a public user with the customer role only', async () => {
    const savedUser = { id: 'user-id', email: 'customer@example.com', roles: ['CUSTOMER'] };
    mockUserModel.mockImplementation((payload) => ({
      save: jest.fn().mockResolvedValue({ ...payload, ...savedUser }),
    }));

    const user = await service.create({
      name: 'Customer',
      email: 'customer@example.com',
      password: 'a-safe-password',
    });

    expect(mockUserModel).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['CUSTOMER'],
      }),
    );
    expect(user).toEqual(expect.objectContaining(savedUser));
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'user.created',
      expect.objectContaining(savedUser),
    );
  });
});
