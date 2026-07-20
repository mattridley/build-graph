# Security

[Back to the specification overview](../../../SPEC.md)

## Trust boundary

- Neon, ClickHouse, Trigger.dev secret keys, and AI Gateway credentials are backend-only.
- Browser-accessible Trigger.dev tokens are scoped to exactly one run and use the default short expiry.
- The public MVP exposes only the fixed seeded demo project; arbitrary project identifiers are rejected.
- No backend credential, database connection string, raw provider error, or secret-bearing configuration may appear in HTML, JavaScript bundles, logs returned by APIs, or streamed message parts.

## Input and output controls

- Validate every API path parameter, query, request body, UI message history, model output, and persisted JSON contract with Zod.
- Use a discriminated allowlist of supported investigation intents. Unsupported or malformed model output fails closed.
- The language model cannot execute SQL, choose database identifiers, mutate current state, invent statuses, or calculate forecast values.
- Database queries are parameterized and repository functions operate on typed identifiers.
- User-facing errors contain normalized codes and non-sensitive detail; full provider diagnostics remain in server logs.

## Data and workflow controls

- Validate that dependencies belong to the same project, reject self-dependencies, and reject any mutation that creates a cycle.
- Treat seeded scenarios as immutable for the MVP.
- Derive deterministic ClickHouse deduplication tokens on the server and reuse them on retry.
- Keep operational mutation and outbox insertion in one transaction.
- Limit simulation queue concurrency to ten and bound every fan-out to the documented shard and sample counts.

## Public-demo review checklist

- Confirm source maps, route responses, Realtime payloads, and browser storage contain no secrets.
- Confirm health checks report only configured/unconfigured and reachable/unreachable states.
- Confirm investigation and scenario endpoints cannot escape the demo project.
- Confirm run tokens cannot subscribe to another run.
- Confirm synthetic content contains no employer, customer, or private-repository information.
- Run dependency, lint, type, and production-build checks before deployment.
