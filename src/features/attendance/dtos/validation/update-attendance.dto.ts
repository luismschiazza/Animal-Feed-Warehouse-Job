import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsMongoId, IsOptional } from 'class-validator';

export class UpdateAttendanceDto {
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
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: 'PRESENT' })
  @IsOptional()
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'JUSTIFIED'])
  status?: string;
}
