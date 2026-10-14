import { Document } from 'mongoose';

export interface Meeting extends Document {
  title: string;
  description: string;
  start_at: Date;
  end_at: Date;
  participants: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
