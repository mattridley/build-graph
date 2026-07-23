# Submission checklist

## Repository and safety

- [ ] Main branch CI is green.
- [x] `pnpm security:check` passes and repository history is reviewed for secrets.
- [x] Repository is public and the README screenshot renders.
- [x] No deployment-owned AI Gateway/OIDC credential is configured; AI is BYOK only.

## Cloud order

- [x] Link Vercel project and provision Neon through the Vercel Marketplace.
- [x] Provision ClickHouse Cloud and Trigger.dev using hackathon credits.
- [x] Configure server-only environment variables for Preview and Production.
- [x] Apply Postgres and ClickHouse migrations twice to prove idempotency.
- [x] Deploy Trigger.dev tasks before deploying the Vercel application.
- [x] Run `seed-demo-data`; verify 42 items, 52 dependencies, 250,000 delivery events, 50,000 CI runs, and 18 cohorts.

## Acceptance rehearsal

- [x] Production and preview health endpoints are safe and healthy.
- [x] Warm forecast completes under 15 seconds; cold under 30 seconds; progress appears under two seconds.
- [x] Retry, expired outbox lease, invalid token, and failed-run paths are verified.
- [x] Desktop and mobile flows complete twice in clean browsers.
- [x] Runtime logs contain correlation IDs and no keys, credentials, prompts, or raw provider errors.

## Submission links

- Production URL: https://build-graph.vercel.app
- Public repository: https://github.com/mattridley/build-graph
- Demo video (under five minutes): _add after recording_
