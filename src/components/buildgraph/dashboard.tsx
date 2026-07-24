'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { GitBranchIcon, MessageSquareIcon, RadarIcon } from 'lucide-react'
import { nanoid } from 'nanoid'
import dynamic from 'next/dynamic'
import { useState } from 'react'

import { ConversationPanel } from '@/components/buildgraph/conversation-panel'
import { ForecastPanel } from '@/components/buildgraph/forecast-panel'
import type { DashboardProject } from '@/components/buildgraph/types'
import { Button } from '@/components/ui/button'
import type {
  BuildGraphDataParts,
  BuildGraphUIMessage,
} from '@/lib/ai/contracts'
import { investigationDataSchema } from '@/lib/ai/contracts'
import type { ForecastResult } from '@/lib/contracts/forecast'

type WorkspacePanel = 'conversation' | 'graph' | 'forecast'

const DeliveryGraph = dynamic(
  () =>
    import('@/components/buildgraph/delivery-graph').then(
      (module) => module.DeliveryGraph,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="text-muted-foreground flex min-h-[480px] flex-1 items-center justify-center text-xs"
        role="status"
      >
        Loading dependency graph...
      </div>
    ),
  },
)

interface BuildGraphDashboardProps {
  project: DashboardProject
}

function artifactMessage(
  data: BuildGraphDataParts['investigation'],
  text: string,
): BuildGraphUIMessage {
  return {
    id: nanoid(),
    role: 'assistant',
    parts: [
      { type: 'text', text },
      { type: 'data-investigation', data },
    ],
  }
}

function scenarioErrorMessage(): BuildGraphUIMessage {
  return {
    id: nanoid(),
    role: 'assistant',
    parts: [
      { type: 'text', text: 'The saved scenario could not be started.' },
      {
        type: 'data-error',
        data: {
          code: 'forecast_unavailable',
          detail: 'The forecast service is temporarily unavailable. Try again.',
        },
      },
    ],
  }
}

export function BuildGraphDashboard({ project }: BuildGraphDashboardProps) {
  const [apiKey, setApiKey] = useState('')
  const [activeArtifact, setActiveArtifact] = useState<
    BuildGraphDataParts['investigation'] | null
  >(null)
  const [result, setResult] = useState<ForecastResult | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>('graph')
  const [scenarioLoading, setScenarioLoading] = useState<string | null>(null)
  const transport = new DefaultChatTransport<BuildGraphUIMessage>({
    api: '/api/chat',
    headers: {
      'x-buildgraph-ai-gateway-key': apiKey,
    },
  })
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    error,
    clearError,
  } = useChat<BuildGraphUIMessage>({ transport })

  function submitPrompt(prompt: string) {
    const question = prompt.trim()
    if (!question || !apiKey.trim()) return
    clearError()
    void sendMessage({ text: question })
  }

  function activateArtifact(data: BuildGraphDataParts['investigation']) {
    setActiveArtifact(data)
    setWorkspacePanel('graph')
  }
  function receiveResult(nextResult: ForecastResult) {
    setResult(nextResult)
  }
  function receiveRetry(data: BuildGraphDataParts['investigation']) {
    setActiveArtifact(data)
    setMessages((current) => [
      ...current,
      artifactMessage(data, 'A normalized retry was started.'),
    ])
  }

  async function startScenario(scenarioId: string) {
    setScenarioLoading(scenarioId)
    try {
      const response = await fetch(
        `/api/projects/demo/scenarios/${scenarioId}/forecast`,
        { method: 'POST' },
      )
      if (!response.ok) throw new Error('scenario_unavailable')
      const data = investigationDataSchema.parse(await response.json())
      setActiveArtifact(data)
      setMessages((current) => [
        ...current,
        artifactMessage(data, 'Saved scenario forecast started.'),
      ])
      setWorkspacePanel('graph')
    } catch {
      setMessages((current) => [...current, scenarioErrorMessage()])
      setWorkspacePanel('conversation')
    } finally {
      setScenarioLoading(null)
    }
  }

  const panelClasses = (panel: WorkspacePanel, desktop: string) =>
    `${workspacePanel === panel ? 'flex' : 'hidden'} ${desktop}`

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1920px] flex-col px-3 py-3 sm:px-5 sm:py-4">
        <header className="border-border flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-3">
            <span className="border-primary/40 bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg border font-mono text-sm">
              BG
            </span>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">
                BuildGraph
              </h1>
              <p className="text-muted-foreground text-xs">
                Atlas release investigation
              </p>
            </div>
          </div>
          <span className="border-border bg-card text-muted-foreground rounded-full border px-3 py-1 font-mono text-[10px]">
            SYNTHETIC DEMO · 42 NODES
          </span>
        </header>

        <nav
          className="mt-3 grid grid-cols-3 gap-2 xl:hidden"
          aria-label="Workspace panels"
        >
          {(
            [
              ['conversation', 'Ask', MessageSquareIcon],
              ['graph', 'Graph', GitBranchIcon],
              ['forecast', 'Forecast', RadarIcon],
            ] as const
          ).map(([panel, label, Icon]) => (
            <Button
              key={panel}
              type="button"
              variant={workspacePanel === panel ? 'default' : 'outline'}
              size="sm"
              aria-pressed={workspacePanel === panel}
              onClick={() => setWorkspacePanel(panel)}
            >
              <Icon className="size-3.5" /> {label}
            </Button>
          ))}
        </nav>

        <section className="grid min-h-0 flex-1 gap-3 pt-3 xl:grid-cols-[minmax(280px,0.82fr)_minmax(600px,1.75fr)_minmax(300px,0.88fr)]">
          <div className={panelClasses('conversation', 'xl:flex')}>
            <ConversationPanel
              messages={messages}
              status={status}
              hasError={Boolean(error)}
              apiKey={apiKey}
              activeInvestigationId={activeArtifact?.investigationId ?? null}
              onApiKeyChange={setApiKey}
              onSubmit={(message) => submitPrompt(message.text)}
              onSuggestion={submitPrompt}
              onActivateInvestigation={activateArtifact}
              onResult={receiveResult}
              onRetry={receiveRetry}
              onStop={() => void stop()}
            />
          </div>

          <section
            className={`${panelClasses('graph', 'xl:flex')} border-border bg-card/70 min-h-[580px] flex-col overflow-hidden rounded-xl border`}
            aria-labelledby="graph-heading"
          >
            <header className="border-border flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
                  Dependency map
                </p>
                <h2 id="graph-heading" className="mt-1 text-sm font-semibold">
                  Atlas release graph
                </h2>
              </div>
              <span className="rounded-full bg-emerald-300/10 px-2 py-1 font-mono text-[9px] text-emerald-200">
                {result ? 'FORECAST MAPPED' : 'BASELINE READY'}
              </span>
            </header>
            <DeliveryGraph
              project={project}
              result={result}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          </section>

          <div className={panelClasses('forecast', 'xl:flex')}>
            <ForecastPanel
              project={project}
              result={result}
              selectedNodeId={selectedNodeId}
              scenarioLoading={scenarioLoading}
              onScenarioSelect={(scenarioId) => void startScenario(scenarioId)}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
