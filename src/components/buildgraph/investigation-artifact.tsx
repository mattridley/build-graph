'use client'

import { useRealtimeRun } from '@trigger.dev/react-hooks'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  RotateCcwIcon,
  WorkflowIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ai-elements/loader'
import type { BuildGraphDataParts } from '@/lib/ai/contracts'
import {
  investigationDataSchema,
  investigationResponseSchema,
} from '@/lib/ai/contracts'
import type { ForecastResult } from '@/lib/contracts/forecast'
import { forecastProgressSchema } from '@/lib/forecast/workflow-contracts'
import type { forecastReleaseTask } from '@/trigger/forecast'

interface InvestigationArtifactProps {
  data: BuildGraphDataParts['investigation']
  active: boolean
  onActivate: () => void
  onResult: (result: ForecastResult) => void
  onRetry: (data: BuildGraphDataParts['investigation']) => void
}

export function InvestigationArtifact({
  data,
  active,
  onActivate,
  onResult,
  onRetry,
}: InvestigationArtifactProps) {
  const { run, error } = useRealtimeRun<typeof forecastReleaseTask>(
    data.runId,
    {
      accessToken: data.publicAccessToken,
      enabled: Boolean(data.publicAccessToken),
      stopOnCompletion: true,
    },
  )
  const [safeFailure, setSafeFailure] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const loadedRun = useRef<string | null>(null)
  const progress = forecastProgressSchema.safeParse(run?.metadata)
  const metadata = progress.success ? progress.data : null
  const terminal = Boolean(run?.isSuccess || run?.isFailed || run?.isCancelled)

  useEffect(() => {
    if (!terminal || loadedRun.current === data.runId) return
    loadedRun.current = data.runId
    const controller = new AbortController()
    void fetch(`/api/investigations/${data.investigationId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('result_unavailable')
        return investigationResponseSchema.parse(await response.json())
      })
      .then((investigation) => {
        if (investigation.result) onResult(investigation.result)
        if (investigation.error) setSafeFailure(investigation.error.detail)
      })
      .catch((fetchError: unknown) => {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === 'AbortError'
        ) {
          return
        }
        setSafeFailure('The completed forecast could not be loaded.')
      })
    return () => controller.abort()
  }, [data.investigationId, data.runId, onResult, terminal])

  async function retry() {
    setRetrying(true)
    setSafeFailure(null)
    try {
      const response = await fetch(
        `/api/investigations/${data.investigationId}/retry`,
        { method: 'POST' },
      )
      if (!response.ok) throw new Error('retry_unavailable')
      onRetry(investigationDataSchema.parse(await response.json()))
    } catch {
      setSafeFailure('The retry could not be started. Please try again.')
    } finally {
      setRetrying(false)
    }
  }

  const failed = Boolean(
    error || run?.isFailed || run?.isCancelled || safeFailure,
  )
  const complete = Boolean(run?.isSuccess && !safeFailure)
  const percentage = metadata?.percentage ?? (complete ? 100 : 2)
  const stage =
    metadata?.stage ?? (complete ? 'complete' : failed ? 'failed' : 'loading')

  return (
    <section
      className={`border-border bg-background/70 mt-2 rounded-lg border p-3 ${active ? 'ring-1 ring-cyan-300/70' : ''}`}
      aria-label="Forecast investigation"
    >
      <button
        type="button"
        onClick={onActivate}
        className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-none"
      >
        <span className="flex items-center gap-2">
          {complete ? (
            <CheckCircle2Icon className="size-4 text-emerald-300" />
          ) : failed ? (
            <AlertTriangleIcon className="size-4 text-amber-300" />
          ) : (
            <span className="relative flex size-4 items-center justify-center text-cyan-300">
              <WorkflowIcon className="absolute size-4 opacity-30" />
              <Loader className="size-3" />
            </span>
          )}
          <span>
            <span className="block text-xs font-medium">Atlas forecast</span>
            <span className="text-muted-foreground block font-mono text-[9px]">
              {data.runId}
            </span>
          </span>
        </span>
        <span className="font-mono text-[10px] tracking-wider text-cyan-200 uppercase">
          {stage}
        </span>
      </button>

      <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-cyan-300 transition-[width] motion-reduce:transition-none"
          style={{ width: `${Math.max(2, percentage)}%` }}
          role="progressbar"
          aria-label="Forecast progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percentage)}
        />
      </div>
      <div className="text-muted-foreground mt-2 flex justify-between font-mono text-[9px]">
        <span>{metadata?.scenarioLabel ?? 'Preparing scenarios'}</span>
        <span>
          {metadata
            ? `${metadata.completedShards}/${metadata.totalShards} shards`
            : 'connecting live progress'}
        </span>
      </div>

      {error && !safeFailure ? (
        <p className="mt-3 text-xs text-amber-200">
          The live token expired or the connection was interrupted.
        </p>
      ) : null}
      {safeFailure ? (
        <p className="mt-3 text-xs text-amber-200">{safeFailure}</p>
      ) : null}
      {failed ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={retrying}
          onClick={() => void retry()}
        >
          <RotateCcwIcon className="size-3.5" />
          {retrying ? 'Starting retry…' : 'Retry forecast'}
        </Button>
      ) : null}
    </section>
  )
}
