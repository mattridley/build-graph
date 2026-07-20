# User Experience

[Back to the specification overview](../../../SPEC.md)

## Layout

Use a dark, restrained, desktop-first dashboard:

- Left: conversation, four example prompts, and AI Elements prompt input.
- Centre: a pannable and zoomable dependency graph built with `@xyflow/react`.
- Right: verdict, completion distribution, percentile dates, and intervention cards.
- Evidence drawer: historical comparison, current blocker, CI health, dependants, and forecast impact for the selected node.

The interface may adapt for narrower screens, but the judged experience is desktop and must preserve access to conversation, graph, result, and evidence.

## Interaction flow

1. The initial screen explains the synthetic Atlas demo and offers supported prompts.
2. Submission immediately creates an investigation artifact; a blank result panel must not linger.
3. Realtime stages update inside the artifact without polling.
4. Completion renders graph, forecast distribution, intervention cards, and evidence together.
5. Selecting a node opens contextual evidence and preserves graph position.
6. Selecting a scenario updates the visual result in place without another model call.
7. A failed run shows safe error detail and a retry action that preserves the original question.

## Visual and content rules

- Critical-path nodes are emphasized; excluded scope is faded but remains inspectable.
- Status color is always supplemented by shape, border, icon, or text label.
- Keyboard users can reach prompts, nodes, scenarios, the drawer, and retry controls with visible focus.
- Graph nodes and charts expose accessible names and textual summaries.
- Loading, empty, unsupported, partial, failed, and completed states are deliberately designed.
- Generated prose is at most 40 words per result and rendered through AI Elements `MessageResponse`.
- Probability, delta, p50/p80/p95 dates, target date, and the model disclaimer remain readable without inspecting the chart.

## Canonical demo

Ask "Can Atlas ship on Friday?", observe multiple simulation shards and progress, inspect the critical path and roughly 42% baseline result, ask for the smallest scope reduction needed for 80% confidence, then choose "Defer audit export" and observe a rise to roughly 81% while the excluded nodes remain visible.
