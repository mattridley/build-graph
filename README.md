# BuildGraph

BuildGraph is a delivery-risk investigation interface that combines a dependency graph, probabilistic forecast, evidence, and what-if scenarios. The MVP uses the fictional Atlas release and deterministic synthetic history.

The implementation contract starts in [SPEC.md](./SPEC.md).

## Prerequisites

- Node.js 22 or newer
- pnpm 11.9.0
- Docker with Compose

## Local bootstrap

```powershell
pnpm install --frozen-lockfile
docker compose up -d --wait
Copy-Item .env.example .env.local
pnpm db:migrate:local
pnpm dev
```

Set these local Docker values in `.env.local` before migrating:

```dotenv
DATABASE_URL=postgresql://buildgraph:buildgraph_local@localhost:5433/buildgraph
CLICKHOUSE_HOST=http://localhost:8124
CLICKHOUSE_USERNAME=buildgraph
CLICKHOUSE_PASSWORD=buildgraph_local
CLICKHOUSE_DATABASE=buildgraph
```

On macOS or Linux, replace the `Copy-Item` command with `cp .env.example .env.local`. Open [http://localhost:3000](http://localhost:3000). The safe configuration endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health).

The local services use non-default host ports:

- Postgres: `localhost:5433`
- ClickHouse HTTP: `localhost:8124`
- ClickHouse native: `localhost:9001`

The development credentials in `compose.yaml` are local-only. Put runtime connection values in `.env.local`; it is ignored by Git.

Database migrations are ordered SQL files under `migrations/postgres` and
`migrations/clickhouse`. Both runners keep a schema-migration ledger, so running
them repeatedly is safe. In CI or cloud environments, populate the normal
environment variables and run `pnpm db:migrate`. For local PowerShell use:

```powershell
pnpm db:migrate:local
# Destructive: drops all application tables, then recreates them.
pnpm db:reset:local
pnpm db:migrate:local
```

The runtime selects Neon through `@neondatabase/serverless` for `*.neon.tech`
URLs and the standard Postgres transport for Docker, while repositories use the
same lazy Drizzle boundary in either environment.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The production build intentionally succeeds without service variables. Code that actually opens a database or service connection uses lazy clients and fails with a clear `ConfigurationError` when required runtime configuration is absent.

GitHub Actions runs the same quality gates, verifies that the Docker Compose services become healthy, and executes the Playwright smoke tests against a production build. Failed browser runs retain their HTML report for seven days.

## Local services

Start and stop the named-volume stack with:

```bash
docker compose up -d --wait
docker compose ps
docker compose down
```

Postgres and ClickHouse both include container health checks. Local volumes are managed by Docker and are never stored in the repository. Integration tests are enabled with `RUN_DATABASE_INTEGRATION=1` after applying migrations.
