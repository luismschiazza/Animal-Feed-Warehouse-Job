import { ApiProperty } from '@nestjs/swagger';
import { GradeDto } from './grade.dto';

export class ResponseGradeSingleDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  payload: GradeDto;
}
