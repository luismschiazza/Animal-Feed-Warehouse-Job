import { ApiPropertyOptional } from '@nestjs/swagger';
import { Matches, ValidateIf } from 'class-validator';
import { USERS_PAGE_CURSOR_PATTERN } from '@/common/authorization/users-page-cursor';

export class ListUsersPageDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 50 })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^(?:[1-9][0-9]?|100)(?![\s\S])/)
  limit?: string;

  @ApiPropertyOptional({ description: 'Opaque continuation cursor from the preceding page' })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(USERS_PAGE_CURSOR_PATTERN)
  after?: string;
}
