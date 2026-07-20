# Testing and Acceptance

[Back to the specification overview](../../../SPEC.md)

## Automated coverage

- Unit: graph validation, topological sorting, scenario validation, critical paths, seeded randomness, triangular sampling, business-time conversion, fallback distributions, and intent schemas.
- Postgres integration: migrations, transactional outbox creation, concurrent claims, failure rollback, and idempotent seeding.
- ClickHouse integration: migrations, batch inserts, retry deduplication, materialized aggregates, summary queries, and test-data isolation.
- Workflow: shard retry, partial batch failure, deterministic reruns, metadata transitions, and result persistence.
- Component: graph highlighting, evidence selection, scenario switching, and progress, empty, unsupported, and error states.
- Playwright: baseline forecast, live progress, node inspection, audit-export selection, probability change, and failed-run retry.
- CI: formatting, linting, type checking, unit tests, Docker-backed integration tests, production build, and Playwright smoke tests.

## Acceptance criteria

- Baseline probability is 35-50%; deferring audit export produces 78-85%.
- The same investigation seed produces identical percentiles and critical paths.
- Every successful answer contains graph, distribution, intervention, and evidence data.
- Trigger.dev visibly runs multiple child simulations and updates the UI without polling.
- ClickHouse supplies duration and CI distributions and stores forecast samples.
- Retrying an outbox batch does not double-count analytical aggregates.
- Warm forecasts finish within 15 seconds and cold forecasts within 30 seconds; progress appears within two seconds.
- Graph interactions remain responsive with all 42 current nodes.
- No backend credentials are present in browser bundles or responses.
- The public Vercel deployment completes the five-minute demo twice from a clean browser session.

## Release evidence

CI logs must show all gates passing. Preserve seed/calibration output, a successful health check, screenshots of the main and evidence states, and a short record of both clean-session production rehearsals. Fail the release if any calibrated range, deterministic replay, deduplication check, security check, or public-demo path is not verified.
