import { Role } from '@/common/enums/role.enum';

export interface JwtPayload {
  sub: string;
  sid: string;
  email: string;
  roles: Role[];
}
