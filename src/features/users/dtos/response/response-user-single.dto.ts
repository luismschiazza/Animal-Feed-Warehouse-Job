import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseSingleDto } from '@/common/dtos/response/api-response-single.dto';
import { UserDto } from './user.dto';

export class ResponseUserSingleDto extends ApiResponseSingleDto<UserDto> {
  @ApiProperty({ type: UserDto })
  payload: UserDto;
}
