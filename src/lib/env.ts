import { z } from 'zod'

const optionalRuntimeSchema = z.object({
  DATABASE_URL: z.string().trim().min(1).optional(),
  CLICKHOUSE_HOST: z.string().trim().min(1).optional(),
  CLICKHOUSE_USERNAME: z.string().trim().min(1).optional(),
  CLICKHOUSE_PASSWORD: z.string().trim().min(1).optional(),
  CLICKHOUSE_DATABASE: z.string().trim().min(1).optional(),
  TRIGGER_SECRET_KEY: z.string().trim().min(1).optional(),
  TRIGGER_PROJECT_REF: z.string().trim().min(1).optional(),
  AI_MODEL: z.string().trim().min(1).optional(),
})

const requiredRuntimeSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  CLICKHOUSE_HOST: z.string().trim().url(),
  CLICKHOUSE_USERNAME: z.string().trim().min(1),
  CLICKHOUSE_PASSWORD: z.string().trim().min(1),
  CLICKHOUSE_DATABASE: z.string().trim().min(1),
  TRIGGER_SECRET_KEY: z.string().trim().min(1),
  TRIGGER_PROJECT_REF: z.string().trim().min(1),
  AI_MODEL: z.string().trim().min(1).default('openai/gpt-5.4'),
})

export type EnvironmentSource = Record<string, string | undefined>
export type OptionalRuntimeEnvironment = z.infer<typeof optionalRuntimeSchema>
export type RuntimeEnvironment = z.infer<typeof requiredRuntimeSchema>

export class ConfigurationError extends Error {
  constructor(public readonly missingVariables: string[]) {
    super(
      `Missing required runtime configuration: ${missingVariables.join(', ')}`,
    )
    this.name = 'ConfigurationError'
  }
}

function withoutBlankValues(source: EnvironmentSource): EnvironmentSource {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    ]),
  )
}

export function readOptionalRuntimeEnvironment(
  source: EnvironmentSource = process.env,
): OptionalRuntimeEnvironment {
  return optionalRuntimeSchema.parse(withoutBlankValues(source))
}

export function requireRuntimeEnvironment(
  source: EnvironmentSource = process.env,
): RuntimeEnvironment {
  const result = requiredRuntimeSchema.safeParse(withoutBlankValues(source))

  if (result.success) {
    return result.data
  }

  const missingVariables = result.error.issues
    .map((issue) => String(issue.path[0]))
    .filter((name, index, names) => names.indexOf(name) === index)

  throw new ConfigurationError(missingVariables)
}
