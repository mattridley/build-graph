# BuildGraph Hackathon MVP Specification

## Overview

BuildGraph is a desktop-first chat agent for investigating software-delivery risk. A user asks a delivery question and receives an interactive dependency graph, a probabilistic completion forecast, supporting evidence, and selectable what-if scenarios. The visual result is the primary answer; generated prose is limited to a short verdict.

The public demo uses a deterministic fictional release named **Atlas** with 42 current work items, 52 dependencies, three optional scope groups, and synthetic delivery history. The headline flow asks whether Atlas can ship on Friday, shows an approximately 42% baseline probability, and then demonstrates that deferring audit export raises the forecast to approximately 81%.

## Status and delivery target

- Implementation target: Hackathon MVP.
- Submission deadline: midnight AoE, 23 July 2026.
- Deployment target: a public Next.js application on the owner's Vercel account.
- Operational store: Neon Postgres.
- Analytical store: ClickHouse Cloud.
- Orchestration: Trigger.dev.
- Data strategy: a checked-in deterministic seed and explicitly labelled synthetic history.

## Architecture at a glance

The Next.js application accepts and validates a chat request, uses structured model output to map it to a fixed investigation intent, persists the investigation, and starts a Trigger.dev workflow. Trigger.dev loads the current dependency graph from Postgres and historical distributions from ClickHouse, fans out deterministic Monte Carlo shards, and persists the aggregate result. The browser follows run-scoped Realtime updates and renders the final graph, distribution, interventions, and evidence without polling.

The language model classifies supported questions and writes a concise explanation. It does not generate SQL, mutate project state, invent delivery status, or calculate the forecast.

## Technology baseline

- Next.js 16 App Router, React 19.2.4+, TypeScript, Tailwind CSS 4, and pnpm.
- shadcn/ui with the Radix base, Geist, AI SDK 6, and AI Elements.
- `@xyflow/react` for the graph and Recharts for distributions and timelines.
- Vercel AI Gateway with `openai/gpt-5.4` as the configurable default.
- Neon Postgres with Drizzle ORM; ClickHouse Cloud with `@clickhouse/client`.
- Trigger.dev 4.3.1 or newer with Realtime.
- Vitest, Testing Library, Playwright, and Docker Compose integration services.
- Node.js 22 or newer; the Codex workspace provides Node 24.14 and pnpm 11.9.

Database and service clients must use lazy getter functions. Do not initialize clients at module scope because Next.js can evaluate modules during builds before runtime environment variables are available.

## Detailed specification

- [Architecture and flows](.ai/context/specs/architecture-and-flows.md): system boundaries, request lifecycle, and failure behavior.
- [Security](.ai/context/specs/security.md): trust boundaries, credentials, validation, and public-demo controls.
- [Data model](.ai/context/specs/data-model.md): Postgres and ClickHouse schemas, consistency, and deduplication.
- [Seed data](.ai/context/specs/seed-data.md): Atlas fixture, generated history, calibration, and provenance.
- [Interfaces and APIs](.ai/context/specs/interfaces-and-apis.md): public TypeScript contracts and HTTP routes.
- [Workflows and forecasting](.ai/context/specs/workflows-and-forecasting.md): Trigger.dev tasks and forecast algorithm.
- [User experience](.ai/context/specs/user-experience.md): dashboard behavior, visual states, and accessibility.
- [Testing and acceptance](.ai/context/specs/testing-and-acceptance.md): automated coverage, performance, and definition of done.
- [Deployment and submission](.ai/context/specs/deployment-and-submission.md): hosted services, configuration, release order, and README deliverables.

## MVP completion bar

The MVP is complete when the seeded baseline and audit-export scenario meet their calibrated probability ranges, identical seeds reproduce identical results, the full UI updates from Trigger.dev Realtime, ClickHouse supplies historical distributions and stores samples, retries do not inflate analytics, backend credentials remain server-only, and the public Vercel demo succeeds twice from a clean browser session.

## Out of scope

Authentication, multi-user or multi-project tenancy, arbitrary repository import, production GitHub synchronization, free-form graph editing, resource allocation, and team-member forecasting are excluded. After every MVP acceptance criterion passes, the first candidates are public GitHub import, forecast snapshot comparison, cycle-safe dependency editing, capacity-aware scheduling, and authentication.
