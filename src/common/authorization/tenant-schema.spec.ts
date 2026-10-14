import { Mongoose } from 'mongoose';
import { AttendanceSchema } from '@/features/attendance/schemas/attendance.schema';
import { DisciplineSchema } from '@/features/disciplines/schemas/discipline.schema';
import { GradeSchema } from '@/features/grades/schemas/grade.schema';
import { MeetingSchema } from '@/features/meeting/schemas/meeting.schema';

describe('Tenant resource schemas', () => {
  it.each([
    ['Attendance', AttendanceSchema],
    ['Discipline', DisciplineSchema],
    ['Grade', GradeSchema],
    ['Meeting', MeetingSchema],
  ] as const)(
    '%s requires immutable BSON organization/owner/creator and bounded lifecycle',
    (name, schema) => {
      for (const field of ['organizationId', 'ownerId', 'createdBy']) {
        expect(schema.paths[field].instance).toBe('ObjectId');
        expect(schema.paths[field].options.immutable).toBe(true);
        expect(schema.paths[field].options.required).toBe(true);
      }
      const model = new Mongoose().model(name, schema);
      const missing = new model().validateSync();
      for (const field of ['organizationId', 'ownerId', 'createdBy'])
        expect(missing.errors[field]).toBeDefined();
      expect(new model({ accessState: 'forged' }).validateSync().errors.accessState).toBeDefined();
    },
  );
});
