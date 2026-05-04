import { boolean, date, integer, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'issued', 'paid', 'partially_paid', 'overdue', 'cancelled', 'credit_noted']);
export const ncfTypeEnum       = pgEnum('ncf_type',       ['B01', 'B02', 'B04', 'B14', 'B15']);

export const ncfSequences = pgTable('ncf_sequences', {
  sequenceId:     uuid('sequence_id').primaryKey().defaultRandom(),
  branchId:       uuid('branch_id'),
  ncfType:        ncfTypeEnum('ncf_type').notNull(),
  prefix:         varchar('prefix', { length: 10 }).notNull(),
  numberFrom:     integer('number_from').notNull(),
  numberTo:       integer('number_to').notNull(),
  currentNumber:  integer('current_number').notNull(),
  expirationDate: date('expiration_date', { mode: 'date' }),
  active:         boolean('active').notNull().default(true),
  createdAt:      timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const invoices = pgTable('invoices', {
  invoiceId:      uuid('invoice_id').primaryKey().defaultRandom(),
  invoiceNumber:  varchar('invoice_number', { length: 30 }).notNull().unique(),
  orderId:        uuid('order_id'),
  customerId:     uuid('customer_id').notNull(),
  branchId:       uuid('branch_id').notNull(),
  ncf:            varchar('ncf', { length: 20 }).notNull().unique(),
  ncfType:        ncfTypeEnum('ncf_type').notNull(),
  issueDate:      date('issue_date', { mode: 'date' }).notNull(),
  dueDate:        date('due_date', { mode: 'date' }),
  currency:       varchar('currency', { length: 3 }).notNull().default('DOP'),
  subtotal:       numeric('subtotal',      { precision: 12, scale: 2 }).notNull(),
  itbis:          numeric('itbis',         { precision: 12, scale: 2 }).notNull(),
  totalExempt:    numeric('total_exempt',  { precision: 12, scale: 2 }).notNull().default('0'),
  total:          numeric('total',         { precision: 12, scale: 2 }).notNull(),
  status:         invoiceStatusEnum('status').notNull().default('issued'),
  issuedBy:       uuid('issued_by').notNull(),
  cancelledAt:    timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
  cancelledReason: text('cancelled_reason'),
  createdAt:      timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const invoiceLines = pgTable('invoice_lines', {
  lineId:      uuid('line_id').primaryKey().defaultRandom(),
  invoiceId:   uuid('invoice_id').notNull().references(() => invoices.invoiceId, { onDelete: 'cascade' }),
  description: varchar('description', { length: 300 }).notNull(),
  quantity:    numeric('quantity',   { precision: 10, scale: 3 }).notNull(),
  unitPrice:   numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  discount:    numeric('discount',   { precision: 12, scale: 2 }).notNull().default('0'),
  taxRate:     numeric('tax_rate',   { precision: 5,  scale: 2 }).notNull(),
  lineTotal:   numeric('line_total', { precision: 12, scale: 2 }).notNull(),
});

export type NcfSequenceRow = typeof ncfSequences.$inferSelect;
export type InvoiceRow     = typeof invoices.$inferSelect;
export type InvoiceLineRow = typeof invoiceLines.$inferSelect;
