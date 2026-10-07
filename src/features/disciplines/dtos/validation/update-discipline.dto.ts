import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDisciplineDto {
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Name of the discipline',
    example: 'Mathematics',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  readonly name?: string;
}
