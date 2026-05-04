import { boolean, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const cashSessionStatusEnum = pgEnum('cash_session_status',  ['open', 'closing', 'closed', 'force_closed']);
export const cashMovementTypeEnum  = pgEnum('cash_movement_type',   ['sale', 'refund', 'cash_in', 'cash_out', 'drop', 'opening_float', 'adjustment']);
export const cashPaymentMethodEnum = pgEnum('payment_method',       ['cash', 'card_manual', 'transfer', 'credit']);

export const terminals = pgTable('terminals', {
  terminalId:         uuid('terminal_id').primaryKey().defaultRandom(),
  branchId:           uuid('branch_id').notNull(),
  name:               varchar('name', { length: 100 }).notNull(),
  deviceFingerprint:  varchar('device_fingerprint', { length: 200 }),
  lastSeenAt:         timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
  active:             boolean('active').notNull().default(true),
  createdAt:          timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const cashSessions = pgTable('cash_sessions', {
  sessionId:              uuid('session_id').primaryKey().defaultRandom(),
  terminalId:             uuid('terminal_id').notNull().references(() => terminals.terminalId),
  branchId:               uuid('branch_id').notNull(),
  cashierId:              uuid('cashier_id').notNull(),
  status:                 cashSessionStatusEnum('status').notNull().default('open'),
  openedAt:               timestamp('opened_at',  { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  openingBalance:         numeric('opening_balance',   { precision: 12, scale: 2 }).notNull(),
  openingDenominations:   text('opening_denominations').notNull().default('{}'),
  closedAt:               timestamp('closed_at',   { withTimezone: true, mode: 'date' }),
  closingBalance:         numeric('closing_balance',   { precision: 12, scale: 2 }),
  closingDenominations:   text('closing_denominations'),
  expectedCash:           numeric('expected_cash',     { precision: 12, scale: 2 }),
  difference:             numeric('difference',        { precision: 12, scale: 2 }),
  differenceReason:       text('difference_reason'),
  closedBy:               uuid('closed_by'),
  supervisorApprovedBy:   uuid('supervisor_approved_by'),
});

export const cashMovements = pgTable('cash_movements', {
  movementId:      uuid('movement_id').primaryKey().defaultRandom(),
  sessionId:       uuid('session_id').notNull().references(() => cashSessions.sessionId),
  type:            cashMovementTypeEnum('type').notNull(),
  amount:          numeric('amount', { precision: 12, scale: 2 }).notNull(),
  method:          cashPaymentMethodEnum('method'),
  relatedInvoiceId: uuid('related_invoice_id'),
  relatedOrderId:   uuid('related_order_id'),
  description:     text('description'),
  performedBy:     uuid('performed_by').notNull(),
  occurredAt:      timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type TerminalRow     = typeof terminals.$inferSelect;
export type CashSessionRow  = typeof cashSessions.$inferSelect;
export type CashMovementRow = typeof cashMovements.$inferSelect;
