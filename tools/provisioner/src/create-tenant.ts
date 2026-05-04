/**
 * Provisioner de tenants.
 * Uso: pnpm db:provision-tenant -- --slug=acme --name="ACME Lavandería" --rnc=123456789
 *
 * 1. Inserta fila en public.tenants
 * 2. Crea schema tenant_xxx
 * 3. Ejecuta template de schema del tenant (02_schema_tenant_template.sql)
 * 4. Registra migración aplicada
 */

import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Args {
  slug: string;
  name: string;
  rnc?: string;
}

function parseArgs(): Args {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v];
    }),
  );
  if (!args.slug || !args.name) {
    throw new Error('Usage: --slug=<slug> --name=<name> [--rnc=<rnc>]');
  }
  return args as Args;
}

async function main() {
  const args = parseArgs();
  const schemaName = `tenant_${args.slug.replace(/-/g, '_')}`;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Insertar tenant
    const { rows } = await client.query(
      `INSERT INTO public.tenants (slug, legal_name, trade_name, rnc, schema_name)
       VALUES ($1, $2, $2, $3, $4)
       RETURNING tenant_id`,
      [args.slug, args.name, args.rnc ?? null, schemaName],
    );
    const tenantId = rows[0].tenant_id;

    // 2. Configurar settings
    await client.query(
      `INSERT INTO public.tenant_settings (tenant_id) VALUES ($1)`,
      [tenantId],
    );

    // 3. Cargar y ejecutar template
    const templatePath = resolve(process.cwd(), 'db/migrations/02_schema_tenant_template.sql');
    const template = readFileSync(templatePath, 'utf-8');
    const sql = template.replace(/\{\{SCHEMA\}\}/g, schemaName);
    await client.query(sql);

    // 4. Registrar migración
    await client.query(
      `INSERT INTO public.schema_migrations (migration_id, schema_name, checksum)
       VALUES ($1, $2, $3)`,
      ['02_initial', schemaName, 'placeholder'],
    );

    await client.query('COMMIT');
    console.log(`✓ Tenant provisioned: ${args.slug} (${tenantId})`);
    console.log(`  Schema: ${schemaName}`);
    console.log(`  URL: https://${args.slug}.nexolaundry.local`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
