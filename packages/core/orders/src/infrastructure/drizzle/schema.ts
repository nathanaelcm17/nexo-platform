import { json, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const orderStatusEnum   = pgEnum('order_status',   ['draft', 'confirmed', 'in_fulfillment', 'ready', 'delivered', 'cancelled']);
export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'partial', 'paid']);
export const orderPriorityEnum = pgEnum('order_priority', ['normal', 'express', 'same_day']);

export const orders = pgTable('orders', {
  orderId:         uuid('order_id').primaryKey().defaultRandom(),
  orderNumber:     varchar('order_number', { length: 30 }).notNull().unique(),
  customerId:      uuid('customer_id').notNull(),
  branchId:        uuid('branch_id').notNull(),
  receivedBy:      uuid('received_by').notNull(),
  status:          orderStatusEnum('status').notNull().default('draft'),
  priority:        orderPriorityEnum('priority').notNull().default('normal'),
  fulfillmentType: varchar('fulfillment_type', { length: 50 }),
  fulfillmentRef:  uuid('fulfillment_ref'),
  subtotal:        numeric('subtotal',   { precision: 12, scale: 2 }).notNull().default('0'),
  discount:        numeric('discount',   { precision: 12, scale: 2 }).notNull().default('0'),
  taxTotal:        numeric('tax_total',  { precision: 12, scale: 2 }).notNull().default('0'),
  total:           numeric('total',      { precision: 12, scale: 2 }).notNull().default('0'),
  paymentStatus:   paymentStatusEnum('payment_status').notNull().default('unpaid'),
  paidAmount:      numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  notes:           text('notes'),
  cancelledReason: text('cancelled_reason'),
  promisedAt:      timestamp('promised_at',   { withTimezone: true, mode: 'date' }),
  receivedAt:      timestamp('received_at',   { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  confirmedAt:     timestamp('confirmed_at',  { withTimezone: true, mode: 'date' }),
  readyAt:         timestamp('ready_at',      { withTimezone: true, mode: 'date' }),
  deliveredAt:     timestamp('delivered_at',  { withTimezone: true, mode: 'date' }),
  cancelledAt:     timestamp('cancelled_at',  { withTimezone: true, mode: 'date' }),
  extensions:      json('extensions').notNull(),
  createdAt:       timestamp('created_at',    { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at',    { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const orderLines = pgTable('order_lines', {
  lineId:        uuid('line_id').primaryKey().defaultRandom(),
  orderId:       uuid('order_id').notNull().references(() => orders.orderId, { onDelete: 'cascade' }),
  catalogItemId: uuid('catalog_item_id').notNull(),
  description:   varchar('description', { length: 300 }).notNull(),
  quantity:      numeric('quantity',   { precision: 10, scale: 3 }).notNull(),
  unitOfMeasure: varchar('unit_of_measure', { length: 20 }).notNull(),
  unitPrice:     numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  discount:      numeric('discount',   { precision: 12, scale: 2 }).notNull().default('0'),
  taxRate:       numeric('tax_rate',   { precision: 5,  scale: 2 }).notNull(),
  lineTotal:     numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  extensions:    json('extensions').notNull(),
  createdAt:     timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type OrderRow     = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;
