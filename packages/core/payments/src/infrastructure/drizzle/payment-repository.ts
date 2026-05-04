import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { Payment, type PaymentMethod } from '../../domain/payment.js';
import type { PaymentRepository } from '../../domain/ports.js';
import * as schema from './schema.js';

type Db = NodePgDatabase<typeof schema>;

export class DrizzlePaymentRepository implements PaymentRepository {
  constructor(private readonly db: Db) {}

  async save(payment: Payment): Promise<void> {
    const s = payment.toSnapshot();
    await this.db.insert(schema.payments).values({
      paymentId:  s.paymentId,
      invoiceId:  s.invoiceId,
      amount:     String(s.amount),
      method:     s.method,
      reference:  s.reference ?? null,
      receivedBy: s.receivedBy,
      receivedAt: s.receivedAt,
      notes:      s.notes ?? null,
    });
  }

  async findByInvoiceId(invoiceId: string): Promise<Payment[]> {
    const rows = await this.db.select().from(schema.payments)
      .where(eq(schema.payments.invoiceId, invoiceId));
    return rows.map(r => Payment.rehydrate({
      paymentId:  r.paymentId,
      invoiceId:  r.invoiceId,
      amount:     Number(r.amount),
      method:     r.method as PaymentMethod,
      reference:  r.reference ?? undefined,
      receivedBy: r.receivedBy,
      receivedAt: r.receivedAt,
      notes:      r.notes ?? undefined,
    }));
  }

  async sumByInvoiceId(invoiceId: string): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = ${invoiceId}`,
    );
    return Number((result.rows[0] as { total: string }).total);
  }
}
