import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateGradeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  student?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  discipline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  term?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comments?: string;
}
