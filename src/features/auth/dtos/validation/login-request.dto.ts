import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({
    example: 'developer@example.com',
    description: 'User email for authentication',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'dev123',
    description: 'User password for authentication',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    description:
      'Organization to bind to this session; requires an active membership. Omit for personal access only.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsMongoId()
  organizationId?: string;
}
