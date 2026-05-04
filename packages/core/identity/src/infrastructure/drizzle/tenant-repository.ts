import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { TenantId } from '@nexo/core-shared-kernel';

import { Tenant, type TenantPlan, type TenantStatus } from '../../domain/tenant.js';
import type { TenantRepository } from '../../domain/ports.js';
import * as schema from './schema.js';

const SCHEMA_RE = /^tenant_[a-z0-9_]{1,55}$/;

export class DrizzleTenantRepository implements TenantRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, { schema });
  }

  async findById(id: TenantId): Promise<Tenant | null> {
    const rows = await this.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.tenantId, id))
      .limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const rows = await this.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async save(tenant: Tenant): Promise<void> {
    const s = tenant.toSnapshot();
    await this.db
      .insert(schema.tenants)
      .values({
        tenantId:    s.tenantId,
        slug:        s.slug,
        legalName:   s.legalName,
        tradeName:   s.tradeName,
        rnc:         s.rnc ?? null,
        country:     s.country,
        timezone:    s.timezone,
        currency:    s.currency,
        schemaName:  s.schemaName,
        plan:        s.plan,
        status:      s.status,
        trialEndsAt: s.trialEndsAt ?? null,
        activatedAt: s.activatedAt ?? null,
        createdAt:   s.createdAt,
        updatedAt:   s.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.tenants.tenantId,
        set: {
          status:      s.status,
          plan:        s.plan,
          activatedAt: s.activatedAt ?? null,
          updatedAt:   s.updatedAt,
        },
      });
  }

  async provisionSchema(schemaName: string): Promise<void> {
    if (!SCHEMA_RE.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }
    // Crea el schema vacío. Las tablas las aplica el provisioner (tools/provisioner).
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  }

  private toAggregate(row: schema.TenantRow): Tenant {
    return Tenant.rehydrate({
      tenantId:    TenantId(row.tenantId),
      slug:        row.slug,
      legalName:   row.legalName,
      tradeName:   row.tradeName,
      rnc:         row.rnc ?? undefined,
      country:     row.country,
      timezone:    row.timezone,
      currency:    row.currency,
      schemaName:  row.schemaName,
      plan:        row.plan as TenantPlan,
      status:      row.status as TenantStatus,
      trialEndsAt: row.trialEndsAt ?? undefined,
      activatedAt: row.activatedAt ?? undefined,
      createdAt:   row.createdAt,
      updatedAt:   row.updatedAt,
    });
  }
}
