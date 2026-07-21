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
              placeholder="Ask about Atlas delivery risk…"
              disabled={busy}
              aria-label="Delivery question"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <span className="text-muted-foreground font-mono text-[9px]">
                ENTER TO INVESTIGATE
              </span>
            </PromptInputTools>
            <PromptInputSubmit
              status={status}
              onStop={onStop}
              disabled={!apiKey.trim()}
              aria-label="Submit delivery question"
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  )
}
