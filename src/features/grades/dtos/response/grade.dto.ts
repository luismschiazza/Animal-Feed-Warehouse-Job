import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class GradeDto {
  @ApiProperty()
  @Expose()
  readonly id: string;

  @ApiProperty()
  @Expose()
  readonly student: string;

  @ApiProperty()
  @Expose()
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
  readonly recordedBy: string;

  @ApiProperty()
  @Expose()
  readonly createdAt: Date;

  @ApiProperty()
  @Expose()
  readonly updatedAt: Date;
}
