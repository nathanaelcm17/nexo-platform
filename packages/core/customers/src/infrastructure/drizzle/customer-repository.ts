import { ilike, or, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { CustomerId, TenantId } from '@nexo/core-shared-kernel';

import {
  Customer,
  type CustomerType,
  type CustomerDocType,
  type CustomerStatus,
} from '../../domain/customer.js';
import type { CustomerRepository, CustomerSearchOptions } from '../../domain/ports.js';
import * as schema from './schema.js';

type Db = NodePgDatabase<typeof schema>;

export class DrizzleCustomerRepository implements CustomerRepository {
  constructor(private readonly db: Db) {}

  async findById(id: CustomerId): Promise<Customer | null> {
    const rows = await this.db.select().from(schema.customers)
      .where(eq(schema.customers.customerId, id)).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async findByCode(code: string): Promise<Customer | null> {
    const rows = await this.db.select().from(schema.customers)
      .where(eq(schema.customers.customerCode, code)).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async findByDocument(_type: string, number: string): Promise<Customer | null> {
    const rows = await this.db.select().from(schema.customers)
      .where(eq(schema.customers.documentNumber, number)).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async search(opts: CustomerSearchOptions): Promise<Customer[]> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    if (opts.phone) {
      const rows = await this.db.select().from(schema.customers)
        .where(eq(schema.customers.phone, opts.phone)).limit(limit);
      return rows.map(r => this.toAggregate(r));
    }

    if (opts.documentNumber) {
      const rows = await this.db.select().from(schema.customers)
        .where(eq(schema.customers.documentNumber, opts.documentNumber)).limit(limit);
      return rows.map(r => this.toAggregate(r));
    }

    if (opts.query) {
      const pattern = `%${opts.query}%`;
      const rows = await this.db.select().from(schema.customers)
        .where(or(
          ilike(schema.customers.firstName, pattern),
          ilike(schema.customers.lastName, pattern),
          ilike(schema.customers.businessName, pattern),
          ilike(schema.customers.customerCode, pattern),
        ))
        .limit(limit)
        .offset(offset);
      return rows.map(r => this.toAggregate(r));
    }

    const rows = await this.db.select().from(schema.customers)
      .limit(limit).offset(offset);
    return rows.map(r => this.toAggregate(r));
  }

  async save(customer: Customer): Promise<void> {
    const s = customer.toSnapshot();
    await this.db.insert(schema.customers)
      .values({
        customerId:     s.customerId,
        customerCode:   s.customerCode,
        customerType:   s.customerType,
        firstName:      s.firstName ?? null,
        lastName:       s.lastName ?? null,
        businessName:   s.businessName ?? null,
        documentType:   (s.documentType ?? null) as schema.CustomerRow['documentType'],
        documentNumber: s.documentNumber ?? null,
        phone:          s.phone ?? null,
        email:          s.email ?? null,
        creditLimit:    String(s.creditLimit),
        status:         s.status,
        notes:          s.notes ?? null,
        extensions:     s.extensions,
        createdAt:      s.createdAt,
        updatedAt:      s.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.customers.customerId,
        set: {
          firstName:      s.firstName ?? null,
          lastName:       s.lastName ?? null,
          businessName:   s.businessName ?? null,
          phone:          s.phone ?? null,
          email:          s.email ?? null,
          creditLimit:    String(s.creditLimit),
          status:         s.status,
          notes:          s.notes ?? null,
          extensions:     s.extensions,
          updatedAt:      s.updatedAt,
        },
      });
  }

  async nextCode(): Promise<string> {
    const result = await this.db.execute(
      sql`SELECT LPAD((COUNT(*) + 1)::text, 6, '0') AS code FROM customers`,
    );
    return `CLI-${(result.rows[0] as { code: string }).code}`;
  }

  private toAggregate(row: schema.CustomerRow): Customer {
    return Customer.rehydrate({
      customerId:     CustomerId(row.customerId),
      tenantId:       TenantId('unknown'), // resolved from search_path context
      customerCode:   row.customerCode,
      customerType:   row.customerType as CustomerType,
      firstName:      row.firstName ?? undefined,
      lastName:       row.lastName ?? undefined,
      businessName:   row.businessName ?? undefined,
      documentType:   (row.documentType ?? undefined) as CustomerDocType | undefined,
      documentNumber: row.documentNumber ?? undefined,
      phone:          row.phone ?? undefined,
      email:          row.email ?? undefined,
      creditLimit:    Number(row.creditLimit),
      status:         row.status as CustomerStatus,
      notes:          row.notes ?? undefined,
      extensions:     (row.extensions as Record<string, unknown>) ?? {},
      createdAt:      row.createdAt,
      updatedAt:      row.updatedAt,
    });
  }
}
