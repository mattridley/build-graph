'use client'

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import {
  BanIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  Clock3Icon,
  FlagIcon,
} from 'lucide-react'
import { memo } from 'react'

import { cn } from '@/lib/utils'

export interface DeliveryNodeData extends Record<string, unknown> {
  title: string
  kind: string
  status: 'todo' | 'in_progress' | 'blocked' | 'done'
  sourceReference: string | null
  isCritical: boolean
  isBlocker: boolean
  isExcluded: boolean
  isSelected: boolean
  delayHours: number
  onSelect: (id: string) => void
}

export type DeliveryGraphNode = Node<DeliveryNodeData, 'delivery'>

const statusIcons = {
  blocked: BanIcon,
  done: CheckCircle2Icon,
  in_progress: Clock3Icon,
  todo: CircleDashedIcon,
}

export const DeliveryNode = memo(function DeliveryNode({
  id,
  data,
}: NodeProps<DeliveryGraphNode>) {
  const StatusIcon = statusIcons[data.status]
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1.5 !border-0 !bg-slate-500"
      />
      <button
        type="button"
        onClick={() => data.onSelect(id)}
        aria-label={`Select ${data.title}, ${data.status.replace('_', ' ')}`}
        aria-pressed={data.isSelected}
        className={cn(
          'bg-card text-card-foreground relative w-[190px] rounded-lg border px-3 py-2.5 text-left shadow-sm transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none',
          data.isCritical &&
            'border-cyan-300 shadow-[0_0_0_1px_oklch(0.78_0.145_170/0.35)]',
          data.isBlocker && 'border-dashed border-amber-300',
          data.isExcluded && 'opacity-35 grayscale',
          data.isSelected && 'ring-2 ring-cyan-300',
          data.kind === 'milestone' && 'rounded-full',
        )}
      >
        <span className="flex items-start gap-2">
          <StatusIcon
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-3.5 shrink-0',
              data.status === 'blocked'
                ? 'text-amber-300'
                : data.status === 'done'
                  ? 'text-emerald-300'
                  : 'text-muted-foreground',
            )}
          />
          <span className="min-w-0">
            <span className="line-clamp-2 block text-[11px] leading-4 font-medium">
              {data.title}
            </span>
            <span className="text-muted-foreground mt-1 flex items-center gap-1 font-mono text-[9px] tracking-wide uppercase">
              {data.sourceReference ?? data.kind}
              {data.isCritical ? (
                <FlagIcon
                  aria-label="Critical path"
                  className="size-2.5 text-cyan-300"
                />
              ) : null}
            </span>
          </span>
        </span>
        {data.delayHours > 0 ? (
          <span className="mt-2 block font-mono text-[9px] text-amber-200">
            +{data.delayHours.toFixed(1)}h expected delay
          </span>
        ) : null}
      </button>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-1.5 !border-0 !bg-slate-500"
      />
    </>
  )
})
