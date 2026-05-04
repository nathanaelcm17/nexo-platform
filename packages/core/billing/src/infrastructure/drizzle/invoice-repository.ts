import { and, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { Invoice, type InvoiceStatus, type NcfType } from '../../domain/invoice.js';
import type { InvoiceRepository, InvoiceListOptions } from '../../domain/ports.js';
import * as schema from './schema.js';

type Db = NodePgDatabase<typeof schema>;

export class DrizzleInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Invoice | null> {
    const [rows, lineRows] = await Promise.all([
      this.db.select().from(schema.invoices).where(eq(schema.invoices.invoiceId, id)).limit(1),
      this.db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)),
    ]);
    return rows[0] ? this.toAggregate(rows[0], lineRows) : null;
  }

  async findByNcf(ncf: string): Promise<Invoice | null> {
    const rows = await this.db.select().from(schema.invoices)
      .where(eq(schema.invoices.ncf, ncf)).limit(1);
    if (!rows[0]) return null;
    const lineRows = await this.db.select().from(schema.invoiceLines)
      .where(eq(schema.invoiceLines.invoiceId, rows[0].invoiceId));
    return this.toAggregate(rows[0], lineRows);
  }

  async save(invoice: Invoice): Promise<void> {
    const s = invoice.toSnapshot();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.invoices)
        .values({
          invoiceId:      s.invoiceId,
          invoiceNumber:  s.invoiceNumber,
          orderId:        s.orderId ?? null,
          customerId:     s.customerId,
          branchId:       s.branchId,
          ncf:            s.ncf,
          ncfType:        s.ncfType,
          issueDate:      s.issueDate,
          dueDate:        s.dueDate ?? null,
          currency:       s.currency,
          subtotal:       String(s.subtotal),
          itbis:          String(s.itbis),
          totalExempt:    String(s.totalExempt),
          total:          String(s.total),
          status:         s.status,
          issuedBy:       s.issuedBy,
          cancelledAt:    s.cancelledAt ?? null,
          cancelledReason: s.cancelledReason ?? null,
          createdAt:      s.createdAt,
        })
        .onConflictDoUpdate({
          target: schema.invoices.invoiceId,
          set: { status: s.status, cancelledAt: s.cancelledAt ?? null, cancelledReason: s.cancelledReason ?? null },
        });

      await tx.delete(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, s.invoiceId));
      if (s.lines.length > 0) {
        await tx.insert(schema.invoiceLines).values(
          s.lines.map(l => ({
            lineId:      l.lineId,
            invoiceId:   s.invoiceId,
            description: l.description,
            quantity:    String(l.quantity),
            unitPrice:   String(l.unitPrice),
            discount:    String(l.discount),
            taxRate:     String(l.taxRate),
            lineTotal:   String(l.lineTotal),
          })),
        );
      }
    });
  }

  async list(opts: InvoiceListOptions): Promise<Invoice[]> {
    const conditions = [];
    if (opts.customerId) conditions.push(eq(schema.invoices.customerId, opts.customerId));
    if (opts.orderId)    conditions.push(eq(schema.invoices.orderId,    opts.orderId));
    if (opts.status)     conditions.push(eq(schema.invoices.status,     opts.status));

    const rows = await this.db.select().from(schema.invoices)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.invoices.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0);

    return Promise.all(rows.map(async row => {
      const lineRows = await this.db.select().from(schema.invoiceLines)
        .where(eq(schema.invoiceLines.invoiceId, row.invoiceId));
      return this.toAggregate(row, lineRows);
    }));
  }

  async updatePaymentStatus(invoiceId: string, status: InvoiceStatus): Promise<void> {
    await this.db.update(schema.invoices)
      .set({ status })
      .where(eq(schema.invoices.invoiceId, invoiceId));
  }

  async nextInvoiceNumber(): Promise<string> {
    const result = await this.db.execute(
      sql`SELECT LPAD((COUNT(*) + 1)::text, 8, '0') AS num FROM invoices`,
    );
    return `FAC-${(result.rows[0] as { num: string }).num}`;
  }

  private toAggregate(row: schema.InvoiceRow, lineRows: schema.InvoiceLineRow[]): Invoice {
    return Invoice.rehydrate({
      invoiceId:      row.invoiceId,
      invoiceNumber:  row.invoiceNumber,
      orderId:        row.orderId ?? undefined,
      customerId:     row.customerId,
      branchId:       row.branchId,
      ncf:            row.ncf,
      ncfType:        row.ncfType as NcfType,
      issueDate:      row.issueDate instanceof Date ? row.issueDate : new Date(row.issueDate),
      dueDate:        row.dueDate ? (row.dueDate instanceof Date ? row.dueDate : new Date(row.dueDate)) : undefined,
      currency:       row.currency,
      subtotal:       Number(row.subtotal),
      itbis:          Number(row.itbis),
      totalExempt:    Number(row.totalExempt),
      total:          Number(row.total),
      status:         row.status as InvoiceStatus,
      issuedBy:       row.issuedBy,
      cancelledAt:    row.cancelledAt ?? undefined,
      cancelledReason: row.cancelledReason ?? undefined,
      lines: lineRows.map(l => ({
        lineId:      l.lineId,
        description: l.description,
        quantity:    Number(l.quantity),
        unitPrice:   Number(l.unitPrice),
        discount:    Number(l.discount),
        taxRate:     Number(l.taxRate),
        lineTotal:   Number(l.lineTotal),
      })),
      createdAt: row.createdAt,
    });
  }
}
