import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

export class MeetingDto {
  @ApiProperty()
  @Expose()
  readonly id: string;

  @ApiProperty()
  @Expose()
  readonly title: string;

  @ApiProperty()
  @Expose()
  readonly description: string;

  @ApiProperty()
  @Expose()
  readonly start_at: Date;

  @ApiProperty()
  @Expose()
  readonly end_at: Date;

  @ApiProperty({ isArray: true })
  @Expose()
  @Transform(({ obj, key }) => obj[key]?.map((id) => id.toString()) ?? [])
  readonly participants: string[];

  @ApiProperty()
  @Expose()
  @Transform(({ obj, key }) => obj[key]?.toString())
  readonly createdBy: string;

  @ApiProperty()
  @Expose()
  readonly createdAt: Date;

  @ApiProperty()
  @Expose()
  readonly updatedAt: Date;
}
