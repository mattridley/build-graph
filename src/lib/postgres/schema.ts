import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import type {
  ForecastResult,
  InvestigationIntent,
} from '@/lib/contracts/forecast'

export const scopeClassification = pgEnum('scope_classification', [
  'core',
  'optional',
])
export const workItemKind = pgEnum('work_item_kind', [
  'requirement',
  'task',
  'pull_request',
  'test',
  'milestone',
])
export const workItemStatus = pgEnum('work_item_status', [
  'todo',
  'in_progress',
  'blocked',
  'done',
])
export const workItemSize = pgEnum('work_item_size', [
  'xs',
  's',
  'm',
  'l',
  'xl',
])
export const dependencyType = pgEnum('dependency_type', ['finish_to_start'])
export const investigationStatus = pgEnum('investigation_status', [
  'queued',
  'running',
  'completed',
  'failed',
])

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    timezone: text('timezone').notNull().default('UTC'),
    targetDate: date('target_date', { mode: 'string' }).notNull(),
    forecastAnchorAt: timestamp('forecast_anchor_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    workingDayStart: time('working_day_start').notNull().default('09:00:00'),
    workingDayEnd: time('working_day_end').notNull().default('17:00:00'),
    enabledWeekdays: integer('enabled_weekdays')
      .array()
      .notNull()
      .default(sql`ARRAY[1, 2, 3, 4, 5]::integer[]`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('projects_slug_uq').on(table.slug),
    check(
      'projects_working_hours_check',
      sql`${table.workingDayStart} < ${table.workingDayEnd}`,
    ),
    check(
      'projects_enabled_weekdays_check',
      sql`cardinality(${table.enabledWeekdays}) > 0 AND ${table.enabledWeekdays} <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::integer[]`,
    ),
  ],
)

export const scopeGroups = pgTable(
  'scope_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    classification: scopeClassification('classification').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [
    unique('scope_groups_project_slug_uq').on(table.projectId, table.slug),
    unique('scope_groups_project_id_id_uq').on(table.projectId, table.id),
    index('scope_groups_project_order_idx').on(
      table.projectId,
      table.displayOrder,
    ),
  ],
)

export const workItems = pgTable(
  'work_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scopeGroupId: uuid('scope_group_id'),
    kind: workItemKind('kind').notNull(),
    status: workItemStatus('status').notNull().default('todo'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    size: workItemSize('size').notNull(),
    progressPercent: integer('progress_percent').notNull().default(0),
    sourceUrl: text('source_url'),
    sourceReference: text('source_reference'),
    graphX: real('graph_x'),
    graphY: real('graph_y'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('work_items_project_id_id_uq').on(table.projectId, table.id),
    foreignKey({
      name: 'work_items_scope_group_fk',
      columns: [table.projectId, table.scopeGroupId],
      foreignColumns: [scopeGroups.projectId, scopeGroups.id],
    }).onDelete('restrict'),
    check(
      'work_items_progress_check',
      sql`${table.progressPercent} BETWEEN 0 AND 100`,
    ),
    index('work_items_project_status_idx').on(table.projectId, table.status),
    index('work_items_project_scope_idx').on(
      table.projectId,
      table.scopeGroupId,
    ),
  ],
)

export const dependencies = pgTable(
  'dependencies',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    predecessorId: uuid('predecessor_id').notNull(),
    successorId: uuid('successor_id').notNull(),
    type: dependencyType('type').notNull().default('finish_to_start'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'dependencies_pk',
      columns: [table.predecessorId, table.successorId],
    }),
    foreignKey({
      name: 'dependencies_predecessor_fk',
      columns: [table.projectId, table.predecessorId],
      foreignColumns: [workItems.projectId, workItems.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'dependencies_successor_fk',
      columns: [table.projectId, table.successorId],
      foreignColumns: [workItems.projectId, workItems.id],
    }).onDelete('cascade'),
    check(
      'dependencies_no_self_check',
      sql`${table.predecessorId} <> ${table.successorId}`,
    ),
    check(
      'dependencies_type_check',
      sql`${table.type} = 'finish_to_start'::dependency_type`,
    ),
    index('dependencies_project_successor_idx').on(
      table.projectId,
      table.successorId,
    ),
  ],
)

export const scenarios = pgTable(
  'scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    excludedScopeGroupIds: jsonb('excluded_scope_group_ids')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    resolvedBlockerIds: jsonb('resolved_blocker_ids')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isSeeded: integer('is_seeded').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('scenarios_project_slug_uq').on(table.projectId, table.slug),
    unique('scenarios_project_id_id_uq').on(table.projectId, table.id),
    index('scenarios_project_idx').on(table.projectId),
    check('scenarios_seeded_check', sql`${table.isSeeded} = 1`),
  ],
)

export const investigations = pgTable(
  'investigations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    originalQuestion: text('original_question').notNull(),
    parsedIntent: jsonb('parsed_intent').$type<InvestigationIntent>().notNull(),
    targetDate: date('target_date', { mode: 'string' }).notNull(),
    selectedScenarioIds: jsonb('selected_scenario_ids')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    triggerRunId: text('trigger_run_id'),
    randomSeed: integer('random_seed').notNull(),
    status: investigationStatus('status').notNull().default('queued'),
    finalResult: jsonb('final_result').$type<ForecastResult>(),
    failureCode: text('failure_code'),
    failureDetail: text('failure_detail'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('investigations_project_created_idx').on(
      table.projectId,
      table.createdAt,
    ),
    index('investigations_project_status_idx').on(
      table.projectId,
      table.status,
    ),
    uniqueIndex('investigations_trigger_run_uq')
      .on(table.triggerRunId)
      .where(sql`${table.triggerRunId} IS NOT NULL`),
  ],
)

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    dispatchedAt: timestamp('dispatched_at', {
      withTimezone: true,
      mode: 'date',
    }),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
    claimToken: uuid('claim_token'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [
    index('outbox_undispatched_idx')
      .on(table.occurredAt)
      .where(sql`${table.dispatchedAt} IS NULL`),
    index('outbox_claim_token_idx').on(table.claimToken),
  ],
)

export const postgresSchema = {
  projects,
  scopeGroups,
  workItems,
  dependencies,
  scenarios,
  investigations,
  outboxEvents,
}
