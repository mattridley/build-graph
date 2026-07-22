# ADR 0001: Separate operational and analytical storage

- Status: accepted
- Date: 2026-07-21

## Context

BuildGraph needs transactional state for projects, graph edits, scenarios, investigations, and a retryable outbox. It also needs high-volume immutable delivery history and Monte Carlo samples for percentile and calibration queries. One storage engine would force either weak transaction semantics or an inefficient analytical model.

## Decision

Use Neon Postgres as the system of record and ClickHouse as a rebuildable analytical projection. Each Postgres mutation that affects analytics writes an outbox row in the same transaction. The `sync-outbox` Trigger.dev task claims rows with leases, writes idempotent ClickHouse projections, and records completion or a retry-safe failure.

The investigation UUID is the canonical correlation ID across API responses, Postgres, Trigger.dev tags/metadata, and investigation-scoped ClickHouse work. API logs contain only allowlisted structured fields.

## Consequences

- Transactional correctness does not depend on ClickHouse availability.
- Projection writes are at-least-once, so stable event IDs and deduplication tokens are mandatory.
- ClickHouse can be rebuilt from the operational store and deterministic synthetic fixture.
- A short interval of analytical staleness is expected and exposed as progress rather than hidden.
- Failed or expired outbox leases can be reclaimed without duplicating logical events.
