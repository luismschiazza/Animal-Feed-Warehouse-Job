import { ApiProperty } from '@nestjs/swagger';
import { AttendanceDto } from './attendance.dto';

export class ResponseAttendanceArrayDto {
  @ApiProperty()
  message: string;

  @ApiProperty({ isArray: true })
  payload: AttendanceDto[];
}
