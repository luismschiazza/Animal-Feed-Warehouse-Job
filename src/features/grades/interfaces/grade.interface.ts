import { Document } from 'mongoose';

export interface Grade extends Document {
  student: string;
  discipline: string;
  value: number;
  type: string;
  term: string;
  comments?: string;
  recordedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
