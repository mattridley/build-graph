import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/u)
  .filter(Boolean)
  .filter((file) => file !== 'scripts/verify-public-safety.mjs')

const forbidden = [
  /(?:sk|pk)_(?:live|prod)_[a-z0-9_-]{12,}/iu,
  /tr_[a-z0-9_-]{20,}/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
]
const remoteDatabaseCredential =
  /(?:postgres|postgresql):\/\/[^\s:@]+:[^\s@]+@(?!localhost|127\.0\.0\.1)/iu
const publicSecretNames = [
  'NEXT_PUBLIC_DATABASE_URL',
  'NEXT_PUBLIC_CLICKHOUSE_PASSWORD',
  'NEXT_PUBLIC_TRIGGER_SECRET_KEY',
]
const violations = []

for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (forbidden.some((pattern) => pattern.test(content))) violations.push(file)
  if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)) {
    if (remoteDatabaseCredential.test(content)) violations.push(file)
  }
  if (publicSecretNames.some((name) => content.includes(name)))
    violations.push(file)
}

if (violations.length > 0) {
  console.error(
    `Potential public secret material detected in: ${[...new Set(violations)].join(', ')}`,
  )
  process.exitCode = 1
} else {
  console.log(`Public-safety scan passed for ${files.length} tracked files.`)
}
