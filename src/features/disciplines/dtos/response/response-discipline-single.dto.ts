import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseSingleDto } from '@/common/dtos/response/api-response-single.dto';
import { DisciplineDto } from './discipline.dto';

export class ResponseDisciplineSingleDto extends ApiResponseSingleDto<DisciplineDto> {
  @ApiProperty({ type: DisciplineDto })
  payload: DisciplineDto;
}
