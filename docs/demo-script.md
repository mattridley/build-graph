# BuildGraph demo script (4 minutes 30 seconds)

## 0:00–0:35 — Frame the decision

Open the deployed app in a clean browser. Point out the synthetic-data banner and the Atlas target date. Explain that BuildGraph answers delivery-risk questions from dependency evidence, not ticket counts.

## 0:35–1:15 — Read the graph

Show the 42-node graph, critical-path styling, the blocked item, and excluded scope. Select an at-risk node and connect its evidence to the release risk.

## 1:15–2:10 — Run a saved scenario

Open Forecast, select the scope-cut scenario, and start it. Show queued/running progress within two seconds, then the p50/p80/p95 distribution, deadline confidence, and evidence-ranked interventions.

## 2:10–3:15 — Ask with a user-owned key

Open Ask. Explain that the key stays in browser memory and is sent only for this request; the deployment has no owner-funded AI credential. Enter the presenter’s own Vercel AI Gateway key, ask “What scope change gets Atlas to 80% confidence?”, and connect the result to the same forecast evidence. Clear the key after the response.

## 3:15–4:00 — Prove the architecture

Show the investigation correlation ID in the response header, Trigger.dev run tags, the Postgres investigation, and the matching ClickHouse investigation query. Explain the Postgres outbox and idempotent ClickHouse projection.

## 4:00–4:30 — Close

Show the public health endpoint and GitHub Actions checks. Restate the limitations: synthetic history, simplified weekday calendar, correlation rather than causation, and forecasts that support—not replace—delivery judgment.

## Rehearsal checklist

- Use a clean browser profile and a presenter-owned gateway key.
- Run baseline and scope-cut paths twice before recording.
- Confirm a retry does not duplicate samples.
- Confirm no key remains in local or session storage.
- Keep the final recording below five minutes.
