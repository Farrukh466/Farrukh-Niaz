import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  AUTH_ISSUER_URL: z.string().url(),
  AUTH_AUDIENCE: z.string().min(1),
  CORS_ORIGINS: z.string().min(1),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  BODY_LIMIT: z.string().default('10kb'),
  NONCE_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  MOCK_AI_MIN_LATENCY_MS: z.coerce.number().int().nonnegative().default(300),
  MOCK_AI_MAX_LATENCY_MS: z.coerce.number().int().nonnegative().default(1200),
  PAYMENT_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.2),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  return parsed.data;
}
