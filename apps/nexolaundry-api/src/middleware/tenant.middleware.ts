import { drizzle } from 'drizzle-orm/node-postgres';
import type { Request, Response, NextFunction } from 'express';
import type { Pool, PoolClient } from 'pg';

import { TenantId } from '@nexo/core-shared-kernel';

interface TenantRow {
  tenant_id: string;
  slug: string;
  schema_name: string;
  status: string;
}

// Símbolo interno para guardar el client en el request sin exponer el tipo en Express globals
const DB_CLIENT_KEY = Symbol('tenantDbClient');

function resolveSlug(req: Request): string | null {
  const header = req.headers['x-tenant-slug'];
  if (header && typeof header === 'string') return header.trim();

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

    let client: PoolClient | undefined;
    try {
      // Verificar tenant en public schema (sin ocupar el client del tenant todavía)
      const result = await pool.query<TenantRow>(
        `SELECT tenant_id, slug, schema_name, status
         FROM public.tenants WHERE slug = $1 LIMIT 1`,
        [slug],
      );

      const row = result.rows[0];
      if (!row || (row.status !== 'active' && row.status !== 'trial')) {
        res.status(404).json({ code: 'TENANT_NOT_FOUND', message: `Tenant '${slug}' not found or inactive` });
        return;
      }

      // Adquirir un client dedicado y setear search_path para el scope del request
      client = await pool.connect();
      await client.query(`SET search_path TO "${row.schema_name}", public`);

      req.tenant = {
        tenantId:   TenantId(row.tenant_id),
        slug:       row.slug,
        schemaName: row.schema_name,
      };

      // Adjuntar drizzle escopado; los repos lo recibirán en el controller
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[DB_CLIENT_KEY] = client;
      req.db = drizzle(client);

      // Liberar el client al finalizar el response
      res.on('finish', () => client?.release());
      res.on('close',  () => client?.release());

      next();
    } catch (err) {
      client?.release();
      next(err);
    }
  };
}
