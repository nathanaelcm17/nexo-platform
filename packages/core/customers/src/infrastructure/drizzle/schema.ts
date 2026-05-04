import {
  boolean,
  json,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const customerTypeEnum   = pgEnum('customer_type',   ['individual', 'business']);
export const customerDocTypeEnum = pgEnum('customer_doc_type', ['cedula', 'rnc', 'passport']);
export const customerStatusEnum  = pgEnum('customer_status',  ['active', 'inactive', 'blocked']);

export const customers = pgTable('customers', {
  customerId:     uuid('customer_id').primaryKey().defaultRandom(),
  customerCode:   varchar('customer_code', { length: 20 }).notNull().unique(),
  customerType:   customerTypeEnum('customer_type').notNull().default('individual'),
  firstName:      varchar('first_name', { length: 100 }),
  lastName:       varchar('last_name', { length: 100 }),
  businessName:   varchar('business_name', { length: 200 }),
  documentType:   customerDocTypeEnum('document_type'),
  documentNumber: varchar('document_number', { length: 20 }),
  phone:          varchar('phone', { length: 20 }),
  email:          text('email'),
  creditLimit:    numeric('credit_limit', { precision: 12, scale: 2 }).notNull().default('0'),
  status:         customerStatusEnum('status').notNull().default('active'),
  notes:          text('notes'),
  extensions:     json('extensions').notNull(),
  createdAt:      timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const customerAddresses = pgTable('customer_addresses', {
  addressId:  uuid('address_id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.customerId, { onDelete: 'cascade' }),
  label:      varchar('label', { length: 50 }),
  street:     text('street').notNull(),
  sector:     varchar('sector', { length: 100 }),
  city:       varchar('city', { length: 100 }),
  province:   varchar('province', { length: 100 }),
  reference:  text('reference'),
  isDefault:  boolean('is_default').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type CustomerRow = typeof customers.$inferSelect;
