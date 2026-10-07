import { ApiProperty } from '@nestjs/swagger';
import { AttendanceDto } from './attendance.dto';

export class ResponseAttendanceSingleDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  payload: AttendanceDto;
}
