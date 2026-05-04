import { numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'card_manual', 'transfer', 'credit']);

export const payments = pgTable('payments', {
  paymentId:  uuid('payment_id').primaryKey().defaultRandom(),
  invoiceId:  uuid('invoice_id').notNull(),
  amount:     numeric('amount', { precision: 12, scale: 2 }).notNull(),
  method:     paymentMethodEnum('method').notNull(),
  reference:  varchar('reference', { length: 100 }),
  receivedBy: uuid('received_by').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  notes:      text('notes'),
});

export type PaymentRow = typeof payments.$inferSelect;
