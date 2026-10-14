import { faker } from '@faker-js/faker';
import { Discipline } from '../schemas/discipline.schema';

export class DisciplineFactory {
  static make(): Partial<Discipline> {
    return {
      name: faker.word.words({ count: 2 }),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static makeMany(amount: number): Partial<Discipline>[] {
    return Array.from({ length: amount }, () => this.make());
  }
}
