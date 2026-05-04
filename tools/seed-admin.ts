/**
 * Seed: crea usuario admin@demo.com / admin123 y datos demo completos.
 * Uso: pnpm tsx tools/seed-admin.ts
 */
import { Client } from 'pg';
import argon2 from 'argon2';

const DB_URL      = process.env.DATABASE_URL ?? 'postgresql://postgres:Mena00123@localhost:5432/nexolaundry';
const TENANT_SLUG = 'demo';
const EMAIL       = 'admin@demo.com';
const PASSWORD    = 'admin123';
const BRANCH_ID   = '50cb49d0-0c62-4582-8597-9e3fbae83835';
const TERMINAL_ID = '6157a250-2bc1-4fa0-b6b9-3755ce6896ee';

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // 1. Hash de contraseña
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    console.log('Hash generated:', hash.substring(0, 30) + '...');

    // 2. Upsert usuario
    const { rows: [user] } = await client.query(`
      INSERT INTO public.users (email, password_hash, first_name, last_name, status)
      VALUES ($1, $2, 'Admin', 'Demo', 'active')
      ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'active'
      RETURNING user_id
    `, [EMAIL, hash]);
    console.log('✓ User:', user.user_id);

    // 3. Tenant
    const { rows: [tenant] } = await client.query(
      `SELECT tenant_id, schema_name FROM public.tenants WHERE slug = $1`, [TENANT_SLUG]
    );
    if (!tenant) throw new Error(`Tenant '${TENANT_SLUG}' not found. Run provisioner first.`);
    console.log('✓ Tenant:', tenant.tenant_id, '| schema:', tenant.schema_name);

    // 4. Membresía
    await client.query(`
      INSERT INTO public.tenant_memberships (user_id, tenant_id, status)
      VALUES ($1, $2, 'active')
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET status = 'active'
    `, [user.user_id, tenant.tenant_id]);
    console.log('✓ Membership linked');

    const schema = tenant.schema_name;

    // 5. Sucursal
    await client.query(`
      INSERT INTO ${schema}.branches (branch_id, name, address, phone, active)
      VALUES ($1, 'Sucursal Principal', 'Av. Winston Churchill, Santo Domingo', '809-555-0001', true)
      ON CONFLICT (branch_id) DO NOTHING
    `, [BRANCH_ID]);
    console.log('✓ Branch seeded');

    // 6. Terminal
    await client.query(`
      INSERT INTO ${schema}.terminals (terminal_id, branch_id, name, active)
      VALUES ($1, $2, 'Caja 1', true)
      ON CONFLICT (terminal_id) DO NOTHING
    `, [TERMINAL_ID, BRANCH_ID]);
    console.log('✓ Terminal seeded');

    // 7. Etapas de producción
    const stages = [
      { name: 'Recepción',     order: 1, is_initial: true,  is_final: false, requires_qc: false, duration: 5  },
      { name: 'Lavado',        order: 2, is_initial: false, is_final: false, requires_qc: false, duration: 60 },
      { name: 'Secado',        order: 3, is_initial: false, is_final: false, requires_qc: false, duration: 45 },
      { name: 'Planchado',     order: 4, is_initial: false, is_final: false, requires_qc: false, duration: 30 },
      { name: 'Control QC',    order: 5, is_initial: false, is_final: false, requires_qc: true,  duration: 10 },
      { name: 'Listo para entrega', order: 6, is_initial: false, is_final: true,  requires_qc: false, duration: 5 },
    ];
    for (const s of stages) {
      await client.query(`
        INSERT INTO ${schema}.stages (name, "order", estimated_duration_min, is_initial, is_final, requires_quality_check, active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT DO NOTHING
      `, [s.name, s.order, s.duration, s.is_initial, s.is_final, s.requires_qc]);
    }
    console.log('✓ Stages seeded (6)');

    // 8. Catálogo de servicios
    const { rows: [{ count: itemCount }] } = await client.query(
      `SELECT COUNT(*) as count FROM ${schema}.catalog_items`
    );
    if (parseInt(itemCount) === 0) {
      const items = [
        { code: 'LAV-001', name: 'Lavado Normal',        category: 'Lavado',     kind: 'per_weight', price: 80,  uom: 'kg'    },
        { code: 'LAV-CAM', name: 'Lavado de camisa',     category: 'Lavado',     kind: 'per_unit',   price: 120, uom: 'piece' },
        { code: 'LAV-PAN', name: 'Lavado de pantalón',   category: 'Lavado',     kind: 'per_unit',   price: 140, uom: 'piece' },
        { code: 'LAV-SAB', name: 'Lavado de sábanas',    category: 'Lavado',     kind: 'per_unit',   price: 180, uom: 'piece' },
        { code: 'LAV-ABR', name: 'Lavado de abrigo',     category: 'Lavado',     kind: 'per_unit',   price: 450, uom: 'piece' },
        { code: 'TIN-SEC', name: 'Tintorería en seco',   category: 'Tintorería', kind: 'per_unit',   price: 280, uom: 'piece' },
        { code: 'PLN-SIM', name: 'Planchado simple',     category: 'Planchado',  kind: 'per_unit',   price: 60,  uom: 'piece' },
        { code: 'UNI-COM', name: 'Uniforme completo',    category: 'Paquetes',   kind: 'package',    price: 320, uom: 'piece' },
      ];
      for (const item of items) {
        const pricingModel =
          item.kind === 'per_unit'   ? JSON.stringify({ kind: 'per_unit',   unitPrice:   item.price }) :
          item.kind === 'per_weight' ? JSON.stringify({ kind: 'per_weight', pricePerKg:  item.price }) :
                                       JSON.stringify({ kind: 'package',    packagePrice: item.price });
        await client.query(`
          INSERT INTO ${schema}.catalog_items (code, name, category, item_type, pricing_model, unit_of_measure, tax_rate, active)
          VALUES ($1, $2, $3, 'service', $4::jsonb, $5, 18.00, true)
          ON CONFLICT (code) DO NOTHING
        `, [item.code, item.name, item.category, pricingModel, item.uom]);
      }
      console.log('✓ Catalog items seeded (8)');
    } else {
      console.log(`✓ Catalog already has ${itemCount} items — skipped`);
    }

    // 9. NCF sequences
    const ncfTypes = ['B01', 'B02', 'B04', 'B14', 'B15'];
    for (const ncfType of ncfTypes) {
      const { rows: [existing] } = await client.query(
        `SELECT 1 FROM ${schema}.ncf_sequences WHERE branch_id = $1 AND ncf_type = $2`, [BRANCH_ID, ncfType]
      );
      if (!existing) {
        await client.query(`
          INSERT INTO ${schema}.ncf_sequences (branch_id, ncf_type, prefix, number_from, number_to, current_number, expiration_date, active)
          VALUES ($1, $2, $2, 1, 10000000, 1, '2027-12-31', true)
        `, [BRANCH_ID, ncfType]);
      }
    }
    console.log('✓ NCF sequences seeded (B01, B02, B04, B14, B15)');

    console.log(`\n✅ Seed completado`);
    console.log(`   Email:    ${EMAIL}`);
    console.log(`   Password: ${PASSWORD}`);
    console.log(`   Tenant:   ${TENANT_SLUG}`);
    console.log(`   Branch:   ${BRANCH_ID}`);
    console.log(`   Terminal: ${TERMINAL_ID}`);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
