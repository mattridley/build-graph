# BuildGraph

BuildGraph is a delivery-risk investigation interface that combines a dependency graph, probabilistic forecast, evidence, and what-if scenarios. The MVP uses the fictional Atlas release and deterministic synthetic history.

The implementation contract starts in [SPEC.md](./SPEC.md).

## Prerequisites

- Node.js 22 or newer
- pnpm 11.9.0
- Docker with Compose

## Local bootstrap

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait
Copy-Item .env.example .env.local
pnpm dev
```

On macOS or Linux, replace the `Copy-Item` command with `cp .env.example .env.local`. Open [http://localhost:3000](http://localhost:3000). The safe configuration endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health).

The local services use non-default host ports:

- Postgres: `localhost:5433`
- ClickHouse HTTP: `localhost:8124`
- ClickHouse native: `localhost:9001`

The development credentials in `compose.yaml` are local-only. Put runtime connection values in `.env.local`; it is ignored by Git.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The production build intentionally succeeds without service variables. Code that actually opens a database or service connection uses lazy clients and fails with a clear `ConfigurationError` when required runtime configuration is absent.

## Local services

Start and stop the named-volume stack with:

```bash
docker compose up -d --wait
docker compose ps
docker compose down
```

Postgres and ClickHouse both include container health checks. Local volumes are managed by Docker and are never stored in the repository.
