import { faker } from '@faker-js/faker';

export class MeetingFactory {
  static make(): any {
    return {
      title: faker.lorem.words(3),
      description: faker.lorem.sentence(),
      start_at: faker.date.soon(),
      end_at: faker.date.soon({ days: 1 }),
      participants: [faker.database.mongodbObjectId(), faker.database.mongodbObjectId()],
      createdBy: faker.database.mongodbObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static makeMany(n: number): any[] {
    return Array.from({ length: n }, () => this.make());
  }
}
