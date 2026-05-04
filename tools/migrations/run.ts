/**
 * Migrations runner.
 * Aplica el schema compartido (01_schema_public.sql).
 * Los tenants se provisionan por separado con tools/provisioner.
 */

import 'dotenv/config';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const path = resolve(process.cwd(), 'db/migrations/01_schema_public.sql');
    const sql = readFileSync(path, 'utf-8');
    console.log('Applying 01_schema_public.sql...');
    await client.query(sql);
    console.log('✓ Schema público inicializado');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
