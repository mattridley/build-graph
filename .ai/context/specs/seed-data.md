# Seed Data

[Back to the specification overview](../../../SPEC.md)

All demo data is generated from a checked-in seed number. Generation must be deterministic, idempotent, chunked to bounded batch sizes, and safe to rerun.

## Atlas current state

- Exactly 42 current nodes, 52 valid dependencies, and one release milestone.
- Three independent optional scope groups, including the `audit-export` group.
- Saved scenarios: baseline, defer audit export, and resolve CI instability.
- A mix of kinds, statuses, sizes, progress values, blockers, CI/test gates, and graph coordinates sufficient to demonstrate every visual state.
- Europe/London working time, Monday-Friday, 09:00-17:00, with no holiday handling.

## Synthetic analytical history

- Approximately 250,000 delivery events and 50,000 CI runs.
- Eighteen fictional completed projects with distributions that support kind/size and fallback queries.
- Stable identifiers and timestamps derived from the seed, not wall-clock generation time.
- Enough sparse categories to exercise exact kind-and-size, kind-only, and global-prior fallbacks.

## Calibration contract

- Atlas baseline must produce 35-50% on-time probability.
- Deferring audit export must produce 78-85% on-time probability.
- The canonical presentation targets approximately 42% and 81%, but acceptance uses the ranges above.
- Re-running the same investigation seed must reproduce percentiles and critical paths.

The seed task verifies record counts, referential integrity, DAG validity, materialized aggregates, and calibration before it succeeds. The UI and README must label all data as synthetic and must contain no employer or private-repository information.
