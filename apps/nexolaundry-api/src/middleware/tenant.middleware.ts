import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { TenantId } from '@nexo/core-shared-kernel';

interface TenantRow {
  tenant_id: string;
  slug: string;
  schema_name: string;
  status: string;
}

function resolveSlug(req: Request): string | null {
  // 1. Header explícito (dev / mobile)
  const header = req.headers['x-tenant-slug'];
  if (header && typeof header === 'string') return header.trim();

  // 2. Subdominio: acme.nexolaundry.local → acme
  const host = req.hostname ?? '';
  const base = (process.env.TENANT_DOMAIN_BASE ?? 'nexolaundry.local').toLowerCase();
  if (host.endsWith(`.${base}`)) {
    return host.slice(0, host.length - base.length - 1);
  }

  return null;
}

export function tenantMiddleware(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const slug = resolveSlug(req);
    if (!slug) {
      res.status(400).json({ code: 'TENANT_REQUIRED', message: 'Tenant slug could not be resolved' });
      return;
    }

    try {
      const result = await pool.query<TenantRow>(
        `SELECT tenant_id, slug, schema_name, status
         FROM public.tenants
         WHERE slug = $1
         LIMIT 1`,
        [slug],
      );

      const row = result.rows[0];
      if (!row || (row.status !== 'active' && row.status !== 'trial')) {
        res.status(404).json({ code: 'TENANT_NOT_FOUND', message: `Tenant '${slug}' not found or inactive` });
        return;
      }

      req.tenant = {
        tenantId:   TenantId(row.tenant_id),
        slug:       row.slug,
        schemaName: row.schema_name,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
