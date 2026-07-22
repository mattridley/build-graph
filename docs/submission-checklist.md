# Submission checklist

## Repository and safety

- [ ] Main branch CI is green.
- [ ] `pnpm security:check` passes and repository history is reviewed for secrets.
- [ ] Repository is public and the README screenshot renders.
- [ ] No deployment-owned AI Gateway/OIDC credential is configured; AI is BYOK only.

## Cloud order

- [ ] Link Vercel project and provision Neon through the Vercel Marketplace.
- [ ] Provision ClickHouse Cloud and Trigger.dev using hackathon credits.
- [ ] Configure server-only environment variables for Preview and Production.
- [ ] Apply Postgres and ClickHouse migrations twice to prove idempotency.
- [ ] Deploy Trigger.dev tasks before deploying the Vercel application.
- [ ] Run `seed-demo-data`; verify 42 items, 52 dependencies, 250,000 delivery events, 50,000 CI runs, and 18 cohorts.

## Acceptance rehearsal

- [ ] Production and preview health endpoints are safe and healthy.
- [ ] Warm forecast completes under 15 seconds; cold under 30 seconds; progress appears under two seconds.
- [ ] Retry, expired outbox lease, invalid token, and failed-run paths are verified.
- [ ] Desktop and mobile flows complete twice in clean browsers.
- [ ] Runtime logs contain correlation IDs and no keys, credentials, prompts, or raw provider errors.

## Submission links

- Production URL: _add after deployment_
- Public repository: _add after repository visibility check_
- Demo video (under five minutes): _add after recording_
