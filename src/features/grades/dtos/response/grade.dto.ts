import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

export class GradeDto {
  @ApiProperty()
  @Expose()
  readonly id: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj, key }) => obj[key]?.toString())
  readonly student: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj, key }) => obj[key]?.toString())
  readonly discipline: string;

  @ApiProperty()
  @Expose()
  readonly value: number;

  @ApiProperty()
  @Expose()
  readonly type: string;

  @ApiProperty()
  @Expose()
  readonly term: string;

  @ApiProperty()
  @Expose()
  readonly comments?: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj, key }) => obj[key]?.toString())
  readonly recordedBy: string;

  @ApiProperty()
  @Expose()
  readonly createdAt: Date;

  @ApiProperty()
  @Expose()
  readonly updatedAt: Date;
}
