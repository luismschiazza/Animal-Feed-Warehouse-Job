import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseArrayDto } from '@/common/dtos/response/api-response-array.dto';
import { UserDto } from './user.dto';

export class ResponseUserArrayDto extends ApiResponseArrayDto<UserDto> {
  @ApiProperty({ type: UserDto, isArray: true })
  payload: UserDto[];
}
