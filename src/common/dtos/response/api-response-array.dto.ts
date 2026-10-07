import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseArrayDto<T> {
  @ApiProperty()
  message: string;

  @ApiProperty({ isArray: true, description: 'List of resources' })
  payload: T[];
}
