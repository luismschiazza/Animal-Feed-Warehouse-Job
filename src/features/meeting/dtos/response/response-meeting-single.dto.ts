import { ApiProperty } from '@nestjs/swagger';
import { MeetingDto } from './meeting.dto';

export class ResponseMeetingSingleDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  payload: MeetingDto;
}
