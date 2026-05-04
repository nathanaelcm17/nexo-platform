import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';

// Enums — referencian los tipos ya creados en 01_schema_public.sql
export const userStatusEnum = pgEnum('user_status', ['pending', 'active', 'suspended', 'locked']);
export const tenantStatusEnum = pgEnum('tenant_status', ['trial', 'active', 'suspended', 'cancelled']);
export const tenantPlanEnum = pgEnum('tenant_plan', ['starter', 'business', 'enterprise']);

// --------------------------------------------------------------------------
// users (schema public)
// --------------------------------------------------------------------------
export const users = pgTable('users', {
  userId:               uuid('user_id').primaryKey().defaultRandom(),
  email:                text('email').notNull().unique(),
  passwordHash:         text('password_hash').notNull(),
  firstName:            varchar('first_name', { length: 100 }).notNull(),
  lastName:             varchar('last_name', { length: 100 }).notNull(),
  phone:                varchar('phone', { length: 20 }),
  status:               userStatusEnum('status').notNull().default('pending'),
  mfaEnabled:           boolean('mfa_enabled').notNull().default(false),
  mfaSecret:            text('mfa_secret'),
  lastLoginAt:          timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
  failedLoginAttempts:  integer('failed_login_attempts').notNull().default(0),
  lockedUntil:          timestamp('locked_until', { withTimezone: true, mode: 'date' }),
  createdAt:            timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// --------------------------------------------------------------------------
// tenants (schema public)
// --------------------------------------------------------------------------
export const tenants = pgTable('tenants', {
  tenantId:     uuid('tenant_id').primaryKey().defaultRandom(),
  slug:         varchar('slug', { length: 63 }).notNull().unique(),
  legalName:    varchar('legal_name', { length: 200 }).notNull(),
  tradeName:    varchar('trade_name', { length: 200 }).notNull(),
  rnc:          varchar('rnc', { length: 20 }),
  country:      varchar('country', { length: 2 }).notNull().default('DO'),
  timezone:     varchar('timezone', { length: 64 }).notNull().default('America/Santo_Domingo'),
  currency:     varchar('currency', { length: 3 }).notNull().default('DOP'),
  schemaName:   varchar('schema_name', { length: 63 }).notNull().unique(),
  plan:         tenantPlanEnum('plan').notNull().default('starter'),
  status:       tenantStatusEnum('status').notNull().default('trial'),
  trialEndsAt:  timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
  activatedAt:  timestamp('activated_at', { withTimezone: true, mode: 'date' }),
  createdAt:    timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// --------------------------------------------------------------------------
// refresh_tokens (schema public)
// --------------------------------------------------------------------------
export const refreshTokens = pgTable('refresh_tokens', {
  tokenId:    uuid('token_id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.tenantId, { onDelete: 'cascade' }),
  tokenHash:  text('token_hash').notNull().unique(),
  issuedAt:   timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  expiresAt:  timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  revokedAt:  timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
});

export type UserRow = typeof users.$inferSelect;
export type TenantRow = typeof tenants.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
