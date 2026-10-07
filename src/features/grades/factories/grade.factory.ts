import { faker } from '@faker-js/faker';

export class GradeFactory {
  static make(): any {
    return {
      student: faker.database.mongodbObjectId(),
      discipline: faker.database.mongodbObjectId(),
      value: faker.number.float({ min: 0, max: 10, multipleOf: 0.1 }),
      type: faker.helpers.arrayElement(['PROVA', 'TRABALHO', 'ATIVIDADE']),
      term: faker.helpers.arrayElement(['BIM1', 'BIM2', 'BIM3', 'BIM4', 'FINAL']),
      comments: faker.lorem.sentence(),
      recordedBy: faker.database.mongodbObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static makeMany(n: number): any[] {
    return Array.from({ length: n }, () => this.make());
  }
}
