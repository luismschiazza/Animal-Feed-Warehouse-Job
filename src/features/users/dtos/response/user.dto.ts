import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { Role } from '@/common/enums/role.enum';

export class UserDto {
  @ApiProperty({
    description: 'Unique identifier of the user',
    example: '6923c22bfa8260daba3b3efe',
  })
  @Expose()
  readonly id: string;

  @ApiProperty({
    description: 'Name of the user',
    example: 'John Doe',
  })
  @Expose()
  readonly name: string;

  @ApiProperty({
    description: 'Email of the user',
    example: 'john.doe@example.com',
  })
  @Expose()
  readonly email: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-11-24T02:25:47.910Z',
  })
  @Expose()
  readonly createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-11-24T02:25:47.910Z',
  })
  @Expose()
  readonly updatedAt: Date;

  @ApiProperty({
    description: 'Roles assigned to the user',
    example: [Role.STUDENT],
    enum: Role,
    isArray: true,
  })
  @Expose()
  readonly roles: Role[];

  @Exclude()
  readonly password: string;
}
