import { ApiProperty } from '@nestjs/swagger';
import { MeetingDto } from './meeting.dto';

export class ResponseMeetingArrayDto {
  @ApiProperty()
  message: string;

  @ApiProperty({ isArray: true })
  payload: MeetingDto[];
}
