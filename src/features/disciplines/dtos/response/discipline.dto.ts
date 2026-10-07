import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class DisciplineDto {
  @ApiProperty({
    description: 'Discipline unique identifier',
    example: '6923c22bfa8260daba3b3f00',
  })
  @Expose()
  readonly id: string;

  @ApiProperty({
    description: 'Discipline name',
    example: 'Mathematics',
  })
  @Expose()
  readonly name: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-11-24T02:25:47.920Z',
  })
  @Expose()
  readonly createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-11-24T02:25:47.920Z',
  })
  @Expose()
  readonly updatedAt: Date;
}
