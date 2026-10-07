interface EnvironmentVariables {
  HOST: string;
  PORT: number;
  MONGO_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  CORS_ORIGIN?: string;
  CORS_CREDENTIALS?: string;
}

const REQUIRED_VARIABLES = ['HOST', 'PORT', 'MONGO_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN'] as const;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const errors: string[] = [];

  for (const key of REQUIRED_VARIABLES) {
    if (!hasValue(config[key])) {
      errors.push(`${key} is required`);
    }
  }

  const port = Number(config.PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push('PORT must be a valid TCP port');
  }

  if (config.JWT_SECRET === 'change_me') {
    errors.push('JWT_SECRET must not use the default placeholder value');
  }

  if (process.env.NODE_ENV === 'production' && config.CORS_ORIGIN === '*') {
    errors.push('CORS_ORIGIN cannot be "*" in production');
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.join('; ')}`);
  }

  return {
    ...config,
    HOST: String(config.HOST),
    PORT: port,
    MONGO_URL: String(config.MONGO_URL),
    JWT_SECRET: String(config.JWT_SECRET),
    JWT_EXPIRES_IN: String(config.JWT_EXPIRES_IN),
    CORS_ORIGIN: optionalString(config.CORS_ORIGIN),
    CORS_CREDENTIALS: optionalString(config.CORS_CREDENTIALS),
  };
}

function hasValue(value: unknown): boolean {
  return typeof value === 'string'
    ? value.trim().length > 0
    : value !== undefined && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
