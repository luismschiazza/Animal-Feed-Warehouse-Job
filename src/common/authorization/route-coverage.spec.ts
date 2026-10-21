import { METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AppController } from '@/app/controllers/app.controller';
import { AttendancesController } from '@/features/attendance/controllers/attendance.controller';
import { AuthController } from '@/features/auth/controllers/auth.controller';
import {
  OrganizationSessionsController,
  SessionsController,
} from '@/features/auth/controllers/sessions.controller';
import { DisciplinesController } from '@/features/disciplines/controllers/disciplines.controller';
import { GradesController } from '@/features/grades/controllers/grades.controller';
import { MeetingsController } from '@/features/meeting/controllers/meeting.controller';
import { UsersController } from '@/features/users/controllers/users.controller';
import { POLICIES_KEY, PUBLIC_ROUTE_KEY } from './policy.decorators';
import { POLICY_DEFINITIONS } from './policy.registry';
import { PolicyRequirement } from './policy.types';

const controllers = [
  AppController,
  AuthController,
  SessionsController,
  OrganizationSessionsController,
  UsersController,
  AttendancesController,
  DisciplinesController,
  GradesController,
  MeetingsController,
];
const reflector = new Reflector();
const publicAllowlist = new Set([
  'AppController.getHello',
  'AuthController.login',
  'AuthController.refresh',
  'UsersController.create',
]);

// Keep this controller list updated when adding modules; runtime guard still denies unannotated routes.
describe('Authorization metadata coverage', () => {
  for (const controller of controllers) {
    for (const method of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[method];
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      const route = `${controller.name}.${method}`;
      it(`${route} has an explicit public exception or registered policies`, () => {
        const targets = [handler, controller];
        const isPublic = reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, targets);
        const requirements = reflector.getAllAndOverride<PolicyRequirement[]>(
          POLICIES_KEY,
          targets,
        );
        if (publicAllowlist.has(route)) {
          expect(isPublic).toBe(true);
          expect(requirements).toBeUndefined();
        } else {
          expect(isPublic).not.toBe(true);
          expect(requirements?.length).toBeGreaterThan(0);
          for (const requirement of requirements ?? []) {
            expect(
              POLICY_DEFINITIONS.some(
                (policy) =>
                  policy.action === requirement.action && policy.resource === requirement.resource,
              ),
            ).toBe(true);
          }
        }
      });
    }
  }
});
