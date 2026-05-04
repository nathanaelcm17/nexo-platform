import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const workOrderStatusEnum = pgEnum('work_order_status', ['pending', 'in_progress', 'on_hold', 'completed', 'cancelled']);

export const stages = pgTable('stages', {
  stageId:               uuid('stage_id').primaryKey().defaultRandom(),
  name:                  varchar('name', { length: 100 }).notNull(),
  order:                 integer('order').notNull(),
  estimatedDurationMin:  integer('estimated_duration_min'),
  requiresQualityCheck:  boolean('requires_quality_check').notNull().default(false),
  isInitial:             boolean('is_initial').notNull().default(false),
  isFinal:               boolean('is_final').notNull().default(false),
  active:                boolean('active').notNull().default(true),
  createdAt:             timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const workOrders = pgTable('work_orders', {
  workOrderId:  uuid('work_order_id').primaryKey().defaultRandom(),
  orderId:      uuid('order_id').notNull().unique(),
  branchId:     uuid('branch_id').notNull(),
  priority:     varchar('priority', { length: 30 }).notNull().default('normal'),
  status:       workOrderStatusEnum('status').notNull().default('pending'),
  slaDeadline:  timestamp('sla_deadline',  { withTimezone: true, mode: 'date' }),
  startedAt:    timestamp('started_at',    { withTimezone: true, mode: 'date' }),
  completedAt:  timestamp('completed_at',  { withTimezone: true, mode: 'date' }),
  createdAt:    timestamp('created_at',    { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at',    { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const productionItems = pgTable('production_items', {
  productionItemId: uuid('production_item_id').primaryKey().defaultRandom(),
  workOrderId:      uuid('work_order_id').notNull().references(() => workOrders.workOrderId, { onDelete: 'cascade' }),
  orderLineId:      uuid('order_line_id'),
  barcode:          varchar('barcode', { length: 50 }).unique(),
  description:      varchar('description', { length: 200 }),
  currentStageId:   uuid('current_stage_id').references(() => stages.stageId),
  currentLocation:  varchar('current_location', { length: 100 }),
  notes:            text('notes'),
  createdAt:        timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const stageTransitions = pgTable('stage_transitions', {
  transitionId:     uuid('transition_id').primaryKey().defaultRandom(),
  productionItemId: uuid('production_item_id').notNull().references(() => productionItems.productionItemId),
  fromStageId:      uuid('from_stage_id').references(() => stages.stageId),
  toStageId:        uuid('to_stage_id').notNull().references(() => stages.stageId),
  performedBy:      uuid('performed_by').notNull(),
  rejected:         boolean('rejected').notNull().default(false),
  notes:            text('notes'),
  occurredAt:       timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type StageRow           = typeof stages.$inferSelect;
export type WorkOrderRow       = typeof workOrders.$inferSelect;
export type ProductionItemRow  = typeof productionItems.$inferSelect;
export type StageTransitionRow = typeof stageTransitions.$inferSelect;
