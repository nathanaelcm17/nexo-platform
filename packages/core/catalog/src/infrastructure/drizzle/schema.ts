import { boolean, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const catalogItemTypeEnum = pgEnum('catalog_item_type', ['service', 'product', 'package']);
export const unitOfMeasureEnum   = pgEnum('unit_of_measure',   ['piece', 'kg', 'dozen', 'hour', 'unit']);

export const catalogItems = pgTable('catalog_items', {
  itemId:           uuid('item_id').primaryKey().defaultRandom(),
  code:             varchar('code', { length: 30 }).notNull().unique(),
  name:             varchar('name', { length: 200 }).notNull(),
  description:      text('description'),
  category:         varchar('category', { length: 100 }),
  itemType:         catalogItemTypeEnum('item_type').notNull().default('service'),
  pricingModel:     text('pricing_model').notNull(),            // JSON
  unitOfMeasure:    unitOfMeasureEnum('unit_of_measure').notNull().default('piece'),
  taxRate:          numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('18.00'),
  taxIncluded:      boolean('tax_included').notNull().default(false),
  fulfillmentHints: text('fulfillment_hints').notNull().default('{}'), // JSON
  active:           boolean('active').notNull().default(true),
  extensions:       text('extensions').notNull().default('{}'),        // JSON
  createdAt:        timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type CatalogItemRow = typeof catalogItems.$inferSelect;
