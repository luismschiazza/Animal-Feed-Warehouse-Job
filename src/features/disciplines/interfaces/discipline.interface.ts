import { Document } from 'mongoose';

export interface Discipline extends Document {
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
