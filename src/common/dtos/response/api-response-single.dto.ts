import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseSingleDto<T> {
  @ApiProperty()
  message: string;

  @ApiProperty({ description: 'Single resource response' })
  payload: T;
}
