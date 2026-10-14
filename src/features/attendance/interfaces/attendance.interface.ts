import { Document } from 'mongoose';

export interface Attendance extends Document {
  student: string;
  discipline: string;
  date: Date;
  status: string;
  recordedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
