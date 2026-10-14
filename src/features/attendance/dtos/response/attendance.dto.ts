import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class AttendanceDto {
  @ApiProperty({
    description: 'Attendance unique identifier',
    example: '6923c22bfa8260daba3b3f00',
  })
  @Expose()
  readonly id: string;

  @ApiProperty({
    description: 'Student ID reference',
    example: '692699041eced8902369e37a',
  })
  @Expose()
  readonly student: string;

  @ApiProperty({
    description: 'Discipline ID reference',
    example: '69269b34abc894b7fafb9255',
  })
  @Expose()
  readonly discipline: string;

  @ApiProperty({
    description: 'Attendance date',
    example: '2025-11-26T03:15:00.000Z',
  })
  @Expose()
  readonly date: Date;

  @ApiProperty({
    description: 'Attendance status',
    example: 'PRESENT',
  })
  @Expose()
  readonly status: string;

  @ApiProperty({
    description: 'ID of the teacher/admin who recorded attendance',
    example: '6923c22bfa8260daba3b3f11',
  })
  @Expose()
  readonly recordedBy: string;
}
