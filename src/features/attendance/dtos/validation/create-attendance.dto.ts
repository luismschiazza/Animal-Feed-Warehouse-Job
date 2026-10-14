import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsMongoId } from 'class-validator';

export class CreateAttendanceDto {
  @ApiProperty()
  @IsMongoId()
  student: string;

  @ApiProperty()
  @IsMongoId()
  discipline: string;

  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'PRESENT' })
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'JUSTIFIED'])
  status: string;
}
