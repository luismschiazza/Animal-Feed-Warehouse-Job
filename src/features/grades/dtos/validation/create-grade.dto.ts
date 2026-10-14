import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateGradeDto {
  @ApiProperty()
  @IsMongoId()
  student: string;

  @ApiProperty()
  @IsMongoId()
  discipline: string;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty({ example: 'PROVA' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'BIM1' })
  @IsString()
  term: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comments?: string;
}
