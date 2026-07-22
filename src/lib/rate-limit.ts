interface RateLimitBucket {
  count: number
  resetsAt: number
}

const buckets = new Map<string, RateLimitBucket>()

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function requestClientKey(request: Request) {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim()
  return forwarded || request.headers.get('x-real-ip') || 'unknown'
}

export function consumeRateLimit(
  key: string,
  options: { limit?: number; windowMs?: number; now?: number } = {},
): RateLimitResult {
  const limit = options.limit ?? 10
  const windowMs = options.windowMs ?? 60_000
  const now = options.now ?? Date.now()
  const current = buckets.get(key)

  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.resetsAt - now) / 1000),
      ),
    }
  }

  current.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

export function resetRateLimitsForTests() {
  buckets.clear()
}
