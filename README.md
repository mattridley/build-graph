# BuildGraph

BuildGraph is a delivery-risk investigation workspace that combines a dependency graph, a seeded Monte Carlo forecast, evidence, and what-if scenarios. The MVP uses the fictional Atlas release and deterministic synthetic history.

> **Synthetic demo:** every Atlas project, person, repository reference, delivery event, CI run, and scenario is fictional. BuildGraph is decision support—not a promise of a delivery date.

The implementation contract starts in [SPEC.md](./SPEC.md). The operational/analytical split is recorded in [ADR 0001](./docs/adr/0001-operational-and-analytical-storage.md), and the presentation path is in the [four-and-a-half-minute demo script](./docs/demo-script.md).

## Product tour

The responsive workspace keeps three related views together:

- **Ask:** natural-language intent classification using the visitor's own Vercel AI Gateway key.
- **Graph:** 42 delivery nodes and 52 dependencies, with critical path, blocked work, scope exclusions, and evidence.
- **Forecast:** p50/p80/p95 completion dates, target confidence, saved scenarios, risk drivers, and interventions.

The graph and forecast are deterministic for the same investigation seed. AI classifies a supported question; it does not invent forecast values or write the verdict.

![BuildGraph Atlas delivery-risk dashboard](./docs/assets/buildgraph-dashboard.png)

## Architecture and data flow

```mermaid
flowchart LR
  B["Browser\nBYOK key held in memory"] -->|"question + request-only key"| N["Next.js on Vercel"]
  N -->|"transactional state + outbox"| P["Neon Postgres"]
  N -->|"start/retry + public token"| T["Trigger.dev"]
  T -->|"leased, idempotent projection"| C["ClickHouse Cloud"]
  T -->|"investigation state"| P
  C -->|"samples + evidence aggregates"| T
  T -->|"live progress"| B
```

Postgres is the system of record. ClickHouse stores rebuildable high-volume history and forecast samples. Trigger.dev runs the seed, outbox sync, sharded forecast, aggregation, and retry workflow. The investigation UUID is the correlation ID in API headers, safe JSON logs, Postgres records, and Trigger.dev tags.

## AI cost and key policy

AI analysis is strictly **bring your own key**. A visitor must enter their own Vercel AI Gateway API key before `/api/chat` will classify a question. The key:

- stays only in React memory (not local storage, session storage, cookies, Postgres, or ClickHouse);
- is sent in `x-buildgraph-ai-gateway-key` only for that request;
- creates a request-scoped gateway client and is never returned or logged;
- has no deployment-key, OIDC, or owner-funded fallback.

`AI_MODEL` selects the model but is not a credential. Trigger.dev and ClickHouse workload may use the project's hackathon credits; public forecast/retry endpoints are rate-limited to constrain that spend. Production should add Vercel Firewall rate limits as the durable outer layer because the included in-memory limiter is instance-local.

## Local bootstrap

Prerequisites: Node.js 22+, pnpm 11.9.0, and Docker with Compose.

```powershell
pnpm install --frozen-lockfile
docker compose up -d --wait
Copy-Item .env.example .env.local
pnpm db:migrate:local
pnpm dev
```

On macOS or Linux use `cp .env.example .env.local`. For the local Compose services, set:

```dotenv
DATABASE_URL=postgresql://buildgraph:buildgraph_local@localhost:5433/buildgraph
CLICKHOUSE_HOST=http://localhost:8124
CLICKHOUSE_USERNAME=buildgraph
CLICKHOUSE_PASSWORD=buildgraph_local
CLICKHOUSE_DATABASE=buildgraph
```

Open [http://localhost:3000](http://localhost:3000). The safe readiness endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health). It reports only configured/reachable states—not hosts, credentials, stack traces, or provider errors.

Local ports are Postgres `5433`, ClickHouse HTTP `8124`, and ClickHouse native `9001`. Compose credentials are development-only. `.env.local` is ignored by Git.

## Environment variables

All variables are server-only; none use the `NEXT_PUBLIC_` prefix.

| Name                  | Required       | Purpose                                       |
| --------------------- | -------------- | --------------------------------------------- |
| `DATABASE_URL`        | runtime        | Neon/Postgres connection string               |
| `CLICKHOUSE_HOST`     | runtime        | ClickHouse HTTPS endpoint                     |
| `CLICKHOUSE_USERNAME` | runtime        | ClickHouse account                            |
| `CLICKHOUSE_PASSWORD` | runtime        | ClickHouse credential                         |
| `CLICKHOUSE_DATABASE` | runtime        | ClickHouse database                           |
| `TRIGGER_SECRET_KEY`  | live workflows | Trigger.dev server credential                 |
| `TRIGGER_PROJECT_REF` | Trigger deploy | Project reference used by `trigger.config.ts` |
| `AI_MODEL`            | optional       | Gateway model ID; defaults in server code     |

There is intentionally no application AI credential. Do not configure AI Gateway OIDC or an owner API key for the Vercel project.

## Cloud provisioning and deployment

Use the providers' hackathon credits and keep every credential in the relevant encrypted environment store.

1. Link the Vercel project; provision Neon from Vercel Marketplace.
2. Provision ClickHouse Cloud and a Trigger.dev project.
3. Configure the variables above for Preview and Production, without printing their values.
4. Run `pnpm db:migrate` twice; migrations have ledgers and must be idempotent.
5. Deploy Trigger.dev tasks from `src/trigger` **before** the app.
6. Run the `seed-demo-data` task and verify its counts and calibration checks.
7. Deploy a Vercel Preview, validate it, then promote/deploy Production.
8. Check `/api/health`, runtime errors, correlation IDs, browser performance, and the paths in [the submission checklist](./docs/submission-checklist.md).

The Next.js build deliberately succeeds without service variables. Connections are lazy and produce a normalized configuration error only when a runtime feature needs them.

## Synthetic data and forecast model

`seed-demo-data` upserts the 42-node/52-dependency graph and three scenarios, then streams 250,000 delivery events and 50,000 CI runs across 18 completed cohorts. Stable UUIDs, a fixture SHA-256, generator version, counts, and seed provenance are stored with the demo record. Re-running is safe because operational rows have stable IDs and analytical chunks use stable deduplication tokens plus ID checks.

The generator uses Europe/London weekdays from 09:00–17:00 and does not model holidays. The engine runs 2,500 samples per production scenario, uses triangular duration sampling, exact → kind → global history fallback, and business-time DAG scheduling. The same seed and sample identity produce the same result across shard boundaries.

Limitations:

- Synthetic history demonstrates the system; it does not validate accuracy on a real organization.
- Dependencies and historical durations omit human, organizational, and unrecorded work.
- Risk-driver association is not proof of causation.
- Percentiles depend on the input graph, scenarios, and simplified calendar.
- The forecast supports delivery judgment and should not replace it.

## Reliability, privacy, and observability

- Transactional outbox writes are atomic with Postgres changes; leased rows are retryable after expiry.
- ClickHouse projection and forecast writes are idempotent.
- Trigger tasks use validated payloads, bounded retries, public read tokens, progress metadata, and safe failure details.
- Public paid-work endpoints have a best-effort per-instance rate limit; configure Vercel Firewall for production enforcement.
- API errors are normalized. Structured logs allowlist correlation, route, event, status, duration, investigation ID, and error type only.
- Keys, credentials, prompts, connection strings, and raw provider/database error bodies are never logged.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm security:check
pnpm test
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Integration tests run migrations twice against Postgres and ClickHouse, then cover storage, projection, outbox, seed, and forecast workflows. Unit tests cover deterministic simulation, schemas, AI boundaries, safe errors, and rate limiting. Playwright checks desktop/mobile navigation, accessibility, browser errors, BYOK defaults, and the sanitized health endpoint. GitHub Actions runs all gates and retains failed browser reports for seven days.

## Hackathon judging map

| Area                      | Evidence                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Useful product            | Ask/Graph/Forecast workspace turns dependency evidence into a delivery decision                  |
| Technical execution       | Deterministic sharded forecast, Postgres outbox, ClickHouse analytics, live Trigger.dev progress |
| Sponsor integration       | Trigger.dev orchestration, ClickHouse analytical workload, Neon/Vercel deployment path           |
| Safety and responsibility | Synthetic provenance, explicit limitations, normalized errors, BYOK-only AI, secret scan         |
| Demo readiness            | Seed verification, responsive browser tests, correlation trail, timed script and checklist       |

Final production and video links are recorded in [the submission checklist](./docs/submission-checklist.md) after deployment and rehearsal.
