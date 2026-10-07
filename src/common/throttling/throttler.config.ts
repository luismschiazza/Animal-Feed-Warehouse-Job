import { ExecutionContext } from '@nestjs/common';

const SENSITIVE_THROTTLED_ENDPOINTS = [
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/refresh' },
];

export function shouldSkipThrottle(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<{
    method?: string;
    originalUrl?: string;
    path?: string;
    route?: { path?: string };
    url?: string;
  }>();

  const method = request.method?.toUpperCase();
  const path = getRequestPath(request);

  return !SENSITIVE_THROTTLED_ENDPOINTS.some(
    (endpoint) => method === endpoint.method && path.endsWith(endpoint.path),
  );
}

function getRequestPath(request: {
  originalUrl?: string;
  path?: string;
  route?: { path?: string };
  url?: string;
}) {
  const path = request.path ?? request.originalUrl ?? request.url ?? request.route?.path ?? '';
  return path.split('?')[0];
}
