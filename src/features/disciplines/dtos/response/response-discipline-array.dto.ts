import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseArrayDto } from '@/common/dtos/response/api-response-array.dto';
import { DisciplineDto } from './discipline.dto';

export class ResponseDisciplineArrayDto extends ApiResponseArrayDto<DisciplineDto> {
  @ApiProperty({ type: DisciplineDto, isArray: true })
  payload: DisciplineDto[];
}
