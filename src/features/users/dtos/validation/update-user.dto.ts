import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@/common/enums/role.enum';
import { IsUniqueEmail } from '../../validators/unique-email.validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'User name', example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'User email', example: 'john@example.com' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @IsUniqueEmail({ message: 'Email already in use' })
  email?: string;

  @ApiPropertyOptional({ description: 'User password', example: 'newPassword123' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({
    description: 'User roles',
    example: ['ADMIN', 'COORDINATOR'],
    isArray: true,
  })
  @IsOptional()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}
