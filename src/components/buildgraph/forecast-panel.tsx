'use client'

import { CalendarClockIcon, ChevronRightIcon, DatabaseIcon } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'

import type { DashboardProject } from '@/components/buildgraph/types'
import { Button } from '@/components/ui/button'
import type { ForecastResult } from '@/lib/contracts/forecast'

interface ForecastPanelProps {
  project: DashboardProject
  result: ForecastResult | null
  selectedNodeId: string | null
  scenarioLoading: string | null
  onScenarioSelect: (scenarioId: string) => void
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T12:00:00Z`))
}

export function ForecastPanel({
  project,
  result,
  selectedNodeId,
  scenarioLoading,
  onScenarioSelect,
}: ForecastPanelProps) {
  const selectedItem = project.workItems.find(
    (item) => item.id === selectedNodeId,
  )
  const metric = result?.analytics.nodeMetrics.find(
    (candidate) => candidate.itemId === selectedNodeId,
  )
  const probability = result?.verdict.onTimeProbability ?? 0.42
  const headline =
    result?.verdict.headline ?? 'Atlas is at risk for the target date.'
  const targetDate = result?.verdict.targetDate ?? project.project.targetDate
  const previewInterventions = project.scenarios
    .filter((scenario) => scenario.slug !== 'baseline')
    .map((scenario) => ({
      scenarioId: scenario.id,
      label: scenario.name,
      probability: scenario.slug === 'defer-audit-export' ? 0.81 : 0.68,
      deltaPercentagePoints: scenario.slug === 'defer-audit-export' ? 39 : 26,
      excludedScopeGroups: scenario.excludedScopeGroupIds,
    }))
  const interventions = result?.interventions.length
    ? result.interventions
    : previewInterventions

  return (
    <aside className="border-border bg-card/70 flex min-h-0 flex-col overflow-y-auto rounded-xl border p-4">
      <section aria-labelledby="forecast-heading">
        <p className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Release forecast
        </p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-5xl font-semibold tracking-tight text-cyan-200">
              {Math.round(probability * 100)}%
            </p>
            <h2 id="forecast-heading" className="mt-2 text-sm font-medium">
              {headline}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[9px] uppercase">Target</p>
            <p className="font-mono text-xs">{shortDate(targetDate)}</p>
          </div>
        </div>

        {result ? (
          <div
            className="mt-5 h-36"
            aria-label="Forecast completion distribution"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={result.distribution.buckets}
                margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
              >
                <CartesianGrid vertical={false} stroke="oklch(1 0 0 / 0.08)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  interval="preserveStartEnd"
                  tick={{ fill: 'oklch(0.7 0 0)', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(label) => shortDate(String(label))}
                  contentStyle={{
                    background: 'oklch(0.18 0.01 255)',
                    border: '1px solid oklch(1 0 0 / 0.12)',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
                <ReferenceLine
                  x={targetDate}
                  stroke="oklch(0.78 0.145 170)"
                  strokeDasharray="3 3"
                  label={{
                    value: 'target',
                    fill: 'oklch(0.78 0.145 170)',
                    fontSize: 9,
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="oklch(0.62 0.11 230)"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="border-border bg-background/60 mt-5 flex h-36 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground max-w-44 text-center text-xs leading-5">
              Run an investigation to render the sampled completion
              distribution.
            </p>
          </div>
        )}

        <dl className="mt-3 grid grid-cols-3 gap-2">
          {[
            ['p50', result?.distribution.p50],
            ['p80', result?.distribution.p80],
            ['p95', result?.distribution.p95],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-border bg-background/70 rounded-md border p-2"
            >
              <dt className="text-muted-foreground font-mono text-[9px] uppercase">
                {label}
              </dt>
              <dd className="mt-1 font-mono text-[10px]">
                {value ? shortDate(value) : '--'}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className="border-border mt-5 border-t pt-4"
        aria-labelledby="interventions-heading"
      >
        <h2
          id="interventions-heading"
          className="font-mono text-[10px] tracking-[0.18em] text-cyan-200 uppercase"
        >
          Interventions
        </h2>
        <div className="mt-3 space-y-2">
          {interventions.map((intervention) => (
            <Button
              key={intervention.scenarioId}
              type="button"
              variant="outline"
              className="h-auto w-full justify-between px-3 py-2.5 text-left"
              disabled={scenarioLoading !== null}
              onClick={() => onScenarioSelect(intervention.scenarioId)}
            >
              <span>
                <span className="block text-xs font-medium">
                  {intervention.label}
                </span>
                <span className="text-muted-foreground mt-1 block font-mono text-[9px]">
                  {scenarioLoading === intervention.scenarioId
                    ? 'Starting scenario...'
                    : `${Math.round(intervention.probability * 100)}% · +${intervention.deltaPercentagePoints} pts`}
                </span>
              </span>
              <ChevronRightIcon className="size-3.5" />
            </Button>
          ))}
        </div>
      </section>

      <section
        className="border-border mt-5 border-t pt-4"
        aria-labelledby="evidence-heading"
      >
        <h2
          id="evidence-heading"
          className="font-mono text-[10px] tracking-[0.18em] text-cyan-200 uppercase"
        >
          Node evidence
        </h2>
        {selectedItem ? (
          <div className="border-border bg-background/70 mt-3 rounded-lg border p-3">
            <p className="text-xs font-medium">{selectedItem.title}</p>
            <p className="text-muted-foreground mt-1 font-mono text-[9px] uppercase">
              {selectedItem.sourceReference} · {selectedItem.kind} ·{' '}
              {selectedItem.status.replace('_', ' ')}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <dt className="text-muted-foreground text-[9px]">
                  Criticality
                </dt>
                <dd className="mt-1 font-mono text-xs">
                  {metric
                    ? `${Math.round(metric.criticalityFrequency * 100)}%`
                    : '--'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-[9px]">
                  Expected delay
                </dt>
                <dd className="mt-1 font-mono text-xs">
                  {metric ? `${metric.expectedDelayHours.toFixed(1)}h` : '--'}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs leading-5">
            Select a graph node to inspect its delivery evidence.
          </p>
        )}
        {result?.evidence.length ? (
          <ul className="mt-3 space-y-2">
            {result.evidence.map((evidence) => (
              <li
                key={`${evidence.label}-${evidence.source}`}
                className="flex gap-2 text-[10px] leading-4"
              >
                <DatabaseIcon
                  className="mt-0.5 size-3 shrink-0 text-cyan-300"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-medium">
                    {evidence.label}: {evidence.value}
                  </span>
                  <span className="text-muted-foreground block">
                    {evidence.detail} · {evidence.source}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="text-muted-foreground border-border mt-5 flex gap-2 border-t pt-4 text-[10px] leading-4">
        <CalendarClockIcon className="mt-0.5 size-3 shrink-0" />
        {result?.verdict.modelDisclaimer ??
          'Forecasts are dependency-and-history scenarios, not delivery commitments.'}
      </p>
    </aside>
  )
}
