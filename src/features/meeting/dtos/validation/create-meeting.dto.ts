import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsMongoId, IsString } from 'class-validator';

export class CreateMeetingDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsDateString()
  start_at: string;

  @ApiProperty()
  @IsDateString()
  end_at: string;

  @ApiProperty({ isArray: true })
  @IsArray()
  @IsMongoId({ each: true })
  participants: string[];
}
