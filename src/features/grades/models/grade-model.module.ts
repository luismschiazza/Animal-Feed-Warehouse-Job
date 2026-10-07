import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Grade, GradeSchema } from '../schemas/grade.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Grade.name, schema: GradeSchema }])],
  exports: [MongooseModule],
})
export class GradeModelModule {}
