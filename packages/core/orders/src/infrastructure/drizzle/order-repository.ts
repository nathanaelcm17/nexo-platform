import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { OrderId } from '@nexo/core-shared-kernel';

import { Order, type OrderStatus, type PaymentStatus, type OrderPriority, type UnitOfMeasure } from '../../domain/order.js';
import type { OrderRepository } from '../../domain/ports.js';
import * as schema from './schema.js';

type Db = NodePgDatabase<typeof schema>;

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: Db) {}

  async findById(id: OrderId): Promise<Order | null> {
    const [orderRows, lineRows] = await Promise.all([
      this.db.select().from(schema.orders).where(eq(schema.orders.orderId, id)).limit(1),
      this.db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, id)),
    ]);
    if (!orderRows[0]) return null;
    return this.toAggregate(orderRows[0], lineRows);
  }

  async findByNumber(number: string): Promise<Order | null> {
    const orderRows = await this.db.select().from(schema.orders)
      .where(eq(schema.orders.orderNumber, number)).limit(1);
    if (!orderRows[0]) return null;
    const lineRows = await this.db.select().from(schema.orderLines)
      .where(eq(schema.orderLines.orderId, orderRows[0].orderId));
    return this.toAggregate(orderRows[0], lineRows);
  }

  async save(order: Order): Promise<void> {
    const s = order.toSnapshot();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.orders)
        .values({
          orderId:         s.orderId,
          orderNumber:     s.orderNumber,
          customerId:      s.customerId,
          branchId:        s.branchId,
          receivedBy:      s.receivedBy,
          status:          s.status,
          priority:        s.priority,
          fulfillmentType: s.fulfillmentType ?? null,
          fulfillmentRef:  s.fulfillmentRef ?? null,
          subtotal:        String(s.subtotal),
          discount:        String(s.discount),
          taxTotal:        String(s.taxTotal),
          total:           String(s.total),
          paymentStatus:   s.paymentStatus,
          paidAmount:      String(s.paidAmount),
          notes:           s.notes ?? null,
          cancelledReason: s.cancelledReason ?? null,
          promisedAt:      s.promisedAt ?? null,
          receivedAt:      s.receivedAt,
          confirmedAt:     s.confirmedAt ?? null,
          readyAt:         s.readyAt ?? null,
          deliveredAt:     s.deliveredAt ?? null,
          cancelledAt:     s.cancelledAt ?? null,
          extensions:      JSON.stringify(s.extensions),
          createdAt:       s.createdAt,
          updatedAt:       s.updatedAt,
        })
        .onConflictDoUpdate({
          target: schema.orders.orderId,
          set: {
            status:          s.status,
            priority:        s.priority,
            fulfillmentRef:  s.fulfillmentRef ?? null,
            subtotal:        String(s.subtotal),
            discount:        String(s.discount),
            taxTotal:        String(s.taxTotal),
            total:           String(s.total),
            paymentStatus:   s.paymentStatus,
            paidAmount:      String(s.paidAmount),
            notes:           s.notes ?? null,
            cancelledReason: s.cancelledReason ?? null,
            confirmedAt:     s.confirmedAt ?? null,
            readyAt:         s.readyAt ?? null,
            deliveredAt:     s.deliveredAt ?? null,
            cancelledAt:     s.cancelledAt ?? null,
            extensions:      JSON.stringify(s.extensions),
            updatedAt:       s.updatedAt,
          },
        });

      // Reemplazar líneas completas (simplificado para Fase 1)
      await tx.delete(schema.orderLines).where(eq(schema.orderLines.orderId, s.orderId));
      if (s.lines.length > 0) {
        await tx.insert(schema.orderLines).values(
          s.lines.map(l => ({
            lineId:        l.lineId,
            orderId:       s.orderId,
            catalogItemId: l.catalogItemId,
            description:   l.description,
            quantity:      String(l.quantity),
            unitOfMeasure: l.unitOfMeasure,
            unitPrice:     String(l.unitPrice),
            discount:      String(l.discount),
            taxRate:       String(l.taxRate),
            lineTotal:     String(l.lineTotal),
            extensions:    JSON.stringify(l.extensions),
          })),
        );
      }
    });
  }

  async nextOrderNumber(): Promise<string> {
    const result = await this.db.execute(sql`SELECT nextval('seq_order_number'::regclass) AS seq`);
    const seq = String((result.rows[0] as { seq: string | number }).seq).padStart(6, '0');
    return `ORD-${seq}`;
  }

  private toAggregate(row: schema.OrderRow, lineRows: schema.OrderLineRow[]): Order {
    return Order.rehydrate({
      orderId:         OrderId(row.orderId),
      orderNumber:     row.orderNumber,
      customerId:      row.customerId,
      branchId:        row.branchId,
      receivedBy:      row.receivedBy,
      tenantId:        'ctx',
      status:          row.status as OrderStatus,
      priority:        row.priority as OrderPriority,
      fulfillmentType: row.fulfillmentType ?? undefined,
      fulfillmentRef:  row.fulfillmentRef ?? undefined,
      subtotal:        Number(row.subtotal),
      discount:        Number(row.discount),
      taxTotal:        Number(row.taxTotal),
      total:           Number(row.total),
      paymentStatus:   row.paymentStatus as PaymentStatus,
      paidAmount:      Number(row.paidAmount),
      notes:           row.notes ?? undefined,
      cancelledReason: row.cancelledReason ?? undefined,
      promisedAt:      row.promisedAt ?? undefined,
      receivedAt:      row.receivedAt,
      confirmedAt:     row.confirmedAt ?? undefined,
      readyAt:         row.readyAt ?? undefined,
      deliveredAt:     row.deliveredAt ?? undefined,
      cancelledAt:     row.cancelledAt ?? undefined,
      extensions:      JSON.parse(row.extensions ?? '{}'),
      lines: lineRows.map(l => ({
        lineId:        l.lineId,
        catalogItemId: l.catalogItemId,
        description:   l.description,
        quantity:      Number(l.quantity),
        unitOfMeasure: l.unitOfMeasure as UnitOfMeasure,
        unitPrice:     Number(l.unitPrice),
        discount:      Number(l.discount),
        taxRate:       Number(l.taxRate),
        lineTotal:     Number(l.lineTotal),
        extensions:    JSON.parse(l.extensions ?? '{}'),
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
