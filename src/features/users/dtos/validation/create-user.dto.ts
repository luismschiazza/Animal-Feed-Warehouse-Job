import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@/common/enums/role.enum';
import { IsUniqueEmail } from '../../validators/unique-email.validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Unique email for the user',
    example: 'john.doe@example.com',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @IsUniqueEmail({ message: 'Email already in use' })
  email: string;

  @ApiProperty({
    description: 'Password of the user (minimum 6 characters)',
    example: 'mysecret123',
    minLength: 6,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @ApiProperty({
    description: 'List of roles assigned to the user',
    example: ['STUDENT'],
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}
