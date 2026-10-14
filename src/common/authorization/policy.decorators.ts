import { SetMetadata } from '@nestjs/common';
import { PolicyRequirement } from './policy.types';

export const PUBLIC_ROUTE_KEY = 'authorization:public';
export const POLICIES_KEY = 'authorization:requirements';

// Explicit exception from global JWT/policy checks; login/refresh still validate credentials.
export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);

// Multiple requirements mean AND, never an implicit grant.
export const RequirePolicies = (...requirements: PolicyRequirement[]) =>
  SetMetadata(POLICIES_KEY, requirements);
