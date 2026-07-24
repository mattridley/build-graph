'use client'

import type { ChatStatus } from 'ai'
import { KeyRoundIcon, SparklesIcon } from 'lucide-react'
import type { ChangeEvent } from 'react'

import { InvestigationArtifact } from '@/components/buildgraph/investigation-artifact'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { Loader } from '@/components/ai-elements/loader'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Input } from '@/components/ui/input'
import type {
  BuildGraphDataParts,
  BuildGraphUIMessage,
} from '@/lib/ai/contracts'
import type { ForecastResult } from '@/lib/contracts/forecast'

export const examplePrompts = [
  'Can Atlas ship by Friday?',
  'What is blocking the Atlas release?',
  'What scope change gets Atlas to 80% confidence?',
  'Compare baseline with deferring audit export.',
] as const

interface ConversationPanelProps {
  messages: BuildGraphUIMessage[]
  status: ChatStatus
  hasError: boolean
  apiKey: string
  activeInvestigationId: string | null
  onApiKeyChange: (value: string) => void
  onSubmit: (message: PromptInputMessage) => void
  onSuggestion: (prompt: string) => void
  onActivateInvestigation: (data: BuildGraphDataParts['investigation']) => void
  onResult: (result: ForecastResult) => void
  onRetry: (data: BuildGraphDataParts['investigation']) => void
  onStop: () => void
}

export function ConversationPanel({
  messages,
  status,
  hasError,
  apiKey,
  activeInvestigationId,
  onApiKeyChange,
  onSubmit,
  onSuggestion,
  onActivateInvestigation,
  onResult,
  onRetry,
  onStop,
}: ConversationPanelProps) {
  const busy = status === 'submitted' || status === 'streaming'
  const thinking =
    status === 'submitted'
      ? {
          title: 'Reading your question',
          detail: 'Classifying intent and gathering the Atlas context.',
        }
      : {
          title: 'Building your investigation',
          detail: 'Connecting delivery evidence to the forecast.',
        }

  return (
    <section className="border-border bg-card/70 flex min-h-0 flex-col overflow-hidden rounded-xl border">
      <header className="border-border border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-cyan-200 uppercase">
              Investigation
            </p>
            <h2 className="mt-1 text-sm font-semibold">Ask delivery risk</h2>
          </div>
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-1 font-mono text-[9px]">
            BYOK AI
          </span>
        </div>
      </header>

      <Conversation className="min-h-0">
        <ConversationContent className="gap-5 p-4">
          {messages.length === 0 ? (
            <div>
              <ConversationEmptyState
                icon={<SparklesIcon className="size-5" />}
                title="Map a delivery question"
                description="Ask about a date, blocker, confidence target, or saved scenario."
                className="min-h-40 p-4"
              />
              <div
                className="mt-2 grid gap-2"
                aria-label="Example delivery questions"
              >
                {examplePrompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => onSuggestion(prompt)}
                    className="border-border bg-background/70 rounded-lg border px-3 py-2 text-left text-[10px] leading-4 transition hover:border-cyan-300/60 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return (
                      <MessageResponse key={`${message.id}-text-${index}`}>
                        {part.text}
                      </MessageResponse>
                    )
                  }
                  if (part.type === 'data-investigation') {
                    return (
                      <InvestigationArtifact
                        key={part.id ?? part.data.investigationId}
                        data={part.data}
                        active={
                          part.data.investigationId === activeInvestigationId
                        }
                        onActivate={() => onActivateInvestigation(part.data)}
                        onResult={onResult}
                        onRetry={onRetry}
                      />
                    )
                  }
                  if (part.type === 'data-unsupported') {
                    return (
                      <div
                        key={part.id ?? `${message.id}-unsupported`}
                        className="mt-2 flex flex-wrap gap-2"
                      >
                        {part.data.suggestions.map((suggestion) => (
                          <button
                            type="button"
                            key={suggestion}
                            onClick={() => onSuggestion(suggestion)}
                            className="border-border bg-background rounded-full border px-2.5 py-1.5 text-left text-[10px] transition hover:border-cyan-300/60 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )
                  }
                  if (part.type === 'data-error') {
                    return (
                      <p
                        key={part.id ?? `${message.id}-error`}
                        role="alert"
                        className="mt-2 rounded-md border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100"
                      >
                        {part.data.detail}
                      </p>
                    )
                  }
                  return null
                })}
              </MessageContent>
            </Message>
          ))}
          {hasError ? (
            <div
              role="alert"
              className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-amber-50"
            >
              <p className="text-xs font-medium">
                Investigation could not start
              </p>
              <p className="mt-1 text-[10px] leading-4 text-amber-100/80">
                Question classification failed. Check that your Vercel AI
                Gateway key is valid and has available credits, then try again.
              </p>
            </div>
          ) : null}
          {busy ? (
            <Message from="assistant">
              <MessageContent>
                <div
                  role="status"
                  aria-live="polite"
                  aria-label="BuildGraph is thinking"
                  className="border-border bg-background/80 flex items-center gap-3 rounded-lg border p-3 shadow-sm"
                >
                  <div className="relative grid size-8 shrink-0 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/10">
                    <span
                      aria-hidden="true"
                      className="absolute inset-1 animate-ping rounded-full bg-cyan-300/15 motion-reduce:animate-none"
                    />
                    <Loader
                      role="presentation"
                      aria-hidden="true"
                      className="relative size-4 text-cyan-200 motion-reduce:animate-none"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-cyan-100">
                      {thinking.title}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[10px] leading-4">
                      {thinking.detail}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="flex shrink-0 items-center gap-1"
                  >
                    <span className="size-1.5 animate-pulse rounded-full bg-cyan-200 motion-reduce:animate-none" />
                    <span className="size-1.5 animate-pulse rounded-full bg-cyan-200 [animation-delay:150ms] motion-reduce:animate-none" />
                    <span className="size-1.5 animate-pulse rounded-full bg-cyan-200 [animation-delay:300ms] motion-reduce:animate-none" />
                  </span>
                </div>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-border space-y-3 border-t p-3">
        <label className="block">
          <span className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[10px]">
            <KeyRoundIcon className="size-3" /> Your Vercel AI Gateway key
          </span>
          <Input
            type="password"
            name="ai-gateway-key"
            aria-label="Your Vercel AI Gateway key"
            autoComplete="off"
            value={apiKey}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onApiKeyChange(event.currentTarget.value)
            }
            placeholder="Enter your own key"
            aria-describedby="api-key-help"
          />
          <span
            id="api-key-help"
            className="text-muted-foreground mt-1 block text-[9px]"
          >
            Used for classification only. Kept in memory; never saved.
          </span>
        </label>

        <PromptInput onSubmit={onSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={
                busy
                  ? 'Investigation in progress…'
                  : 'Ask about Atlas delivery risk…'
              }
              disabled={busy}
              aria-label="Delivery question"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {busy ? (
                <span
                  aria-hidden="true"
                  className="flex items-center gap-1.5 font-mono text-[9px] text-cyan-200"
                >
                  <Loader
                    role="presentation"
                    className="size-3 motion-reduce:animate-none"
                  />
                  BUILDGRAPH IS THINKING
                </span>
              ) : (
                <span className="text-muted-foreground font-mono text-[9px]">
                  ENTER TO INVESTIGATE
                </span>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              status={status}
              onStop={onStop}
              disabled={!busy && !apiKey.trim()}
              aria-label={
                busy ? 'Stop investigation' : 'Submit delivery question'
              }
              title={busy ? 'Stop investigation' : 'Submit delivery question'}
            >
              {busy ? (
                <Loader
                  role="presentation"
                  aria-hidden="true"
                  className="motion-reduce:animate-none"
                />
              ) : undefined}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  )
}
