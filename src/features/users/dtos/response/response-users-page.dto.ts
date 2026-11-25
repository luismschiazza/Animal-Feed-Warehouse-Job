import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from './user.dto';

class UsersPagePayloadDto {
  @ApiProperty({ type: [UserDto] })
  items: UserDto[];

  @ApiProperty({ type: String, nullable: true, description: 'Null when the scan is exhausted' })
  nextCursor: string | null;
}

export class ResponseUsersPageDto {
  @ApiProperty({ type: UsersPagePayloadDto })
  payload: UsersPagePayloadDto;

  @ApiProperty()
  message: string;
}
