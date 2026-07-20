# Deployment and Submission

[Back to the specification overview](../../../SPEC.md)

## Hosted services

- A Vercel project linked to the GitHub repository.
- Neon Postgres provisioned through Vercel Marketplace.
- ClickHouse Cloud using hackathon credits.
- Trigger.dev Cloud using hackathon credits.
- Vercel AI Gateway using OIDC authentication.

Local development uses Docker Compose for Postgres and ClickHouse. Cloud credentials and production data never enter committed environment files.

## Environment variables

- `DATABASE_URL`
- `CLICKHOUSE_HOST`
- `CLICKHOUSE_USERNAME`
- `CLICKHOUSE_PASSWORD`
- `CLICKHOUSE_DATABASE`
- `TRIGGER_SECRET_KEY`
- `TRIGGER_PROJECT_REF`
- Optional `AI_MODEL`, defaulting to `openai/gpt-5.4`

Document variables in an example file with non-secret placeholders. Validate required configuration lazily at the boundary that uses it. `/api/health` may expose only safe configuration and reachability states.

## Release order

1. Run formatting, linting, type checks, unit and integration tests, production build, and browser smoke tests.
2. Apply Postgres and ClickHouse migrations.
3. Deploy Trigger.dev tasks before the Vercel application.
4. Configure Vercel environment variables and deploy the application.
5. Run the idempotent production seed and its integrity/calibration checks.
6. Smoke-test health, baseline forecast, scenario forecast, Realtime token scope, retry deduplication, and a clean-session browser flow.
7. Freeze the dataset and rehearse the five-minute demo twice before recording.

## Submission artifacts

The public README must contain architecture, local and hosted setup, synthetic-data provenance, screenshots, judging-criteria mapping, deployed URL, and a concise demo walkthrough. The repository must not require private context to understand or run the demo. The final submission should link the public deployment and repository and use the frozen seeded dataset shown in the walkthrough.
