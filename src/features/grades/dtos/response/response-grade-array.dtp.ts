import { ApiProperty } from '@nestjs/swagger';
import { GradeDto } from './grade.dto';

export class ResponseGradeArrayDto {
  @ApiProperty()
  message: string;

  @ApiProperty({ isArray: true })
  payload: GradeDto[];
}
