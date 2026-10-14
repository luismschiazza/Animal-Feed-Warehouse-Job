import { faker } from '@faker-js/faker';

export class AttendanceFactory {
  static make(): any {
    const STATUS = ['PRESENT', 'ABSENT', 'LATE', 'JUSTIFIED'];

    return {
      student: faker.database.mongodbObjectId(),
      discipline: faker.database.mongodbObjectId(),
      date: faker.date.recent(),
      status: faker.helpers.arrayElement(STATUS),
      recordedBy: faker.database.mongodbObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static makeMany(amount: number): any[] {
    return Array.from({ length: amount }, () => this.make());
  }
}
