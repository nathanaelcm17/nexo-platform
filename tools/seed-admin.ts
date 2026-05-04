/**
 * Seed: crea usuario admin@demo.com con contraseña admin123
 * y lo vincula al tenant demo.
 * Uso: pnpm tsx tools/seed-admin.ts
 */
import { Client } from 'pg';
import argon2 from 'argon2';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:Mena00123@localhost:5432/nexolaundry';
const TENANT_SLUG = 'demo';
const EMAIL       = 'admin@demo.com';
const PASSWORD    = 'admin123';

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // 1. Generar hash
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    console.log('Hash generated:', hash.substring(0, 30) + '...');

    // 2. Insertar (o actualizar) usuario
    const { rows: [user] } = await client.query(`
      INSERT INTO public.users (email, password_hash, first_name, last_name, status)
      VALUES ($1, $2, 'Admin', 'Demo', 'active')
      ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'active'
      RETURNING user_id
    `, [EMAIL, hash]);

    console.log('User upserted:', user.user_id);

    // 3. Obtener tenant
    const { rows: [tenant] } = await client.query(
      `SELECT tenant_id FROM public.tenants WHERE slug = $1`, [TENANT_SLUG]
    );
    if (!tenant) throw new Error(`Tenant '${TENANT_SLUG}' not found. Run provisioner first.`);

    // 4. Vincular membresía
    await client.query(`
      INSERT INTO public.tenant_memberships (user_id, tenant_id, status)
      VALUES ($1, $2, 'active')
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET status = 'active'
    `, [user.user_id, tenant.tenant_id]);

    console.log(`\n✓ Admin seeded successfully`);
    console.log(`  Email:    ${EMAIL}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log(`  Tenant:   ${TENANT_SLUG}`);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
