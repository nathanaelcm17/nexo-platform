import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';

import type { EventBus } from '@nexo/core-shared-kernel';
import { OrderId } from '@nexo/core-shared-kernel';
import {
  DrizzleOrderRepository,
  CreateOrderUseCase,
  ConfirmOrderUseCase,
  CancelOrderUseCase,
  DeliverOrderUseCase,
  AddOrderLineUseCase,
} from '@nexo/core-orders';

const lineSchema = z.object({
  catalogItemId: z.string().uuid(),
  description:   z.string().min(1),
  quantity:      z.number().positive(),
  unitOfMeasure: z.enum(['piece', 'kg', 'dozen', 'hour', 'unit']),
  unitPrice:     z.number().nonnegative(),
  discount:      z.number().nonnegative().optional(),
  taxRate:       z.number().min(0).max(100),
  extensions:    z.record(z.unknown()).optional(),
});

const createSchema = z.object({
  customerId:      z.string().uuid(),
  branchId:        z.string().uuid(),
  priority:        z.enum(['normal', 'express', 'same_day']).optional(),
  fulfillmentType: z.string().optional(),
  notes:           z.string().optional(),
  promisedAt:      z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  extensions:      z.record(z.unknown()).optional(),
  lines:           z.array(lineSchema).min(1),
});

const cancelSchema = z.object({ reason: z.string().min(1) });

const listSchema = z.object({
  status:     z.string().optional(),
  customerId: z.string().uuid().optional(),
  branchId:   z.string().uuid().optional(),
  q:          z.string().optional(),
  date:       z.string().optional(), // YYYY-MM-DD
  limit:      z.coerce.number().int().min(1).max(100).optional(),
  offset:     z.coerce.number().int().min(0).optional(),
});

export function createOrdersRouter(eventBus: EventBus): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }); return; }
      const { status, customerId, branchId, q, date, limit = 50, offset = 0 } = parsed.data;

      // Query enriquecida con datos del cliente via JOIN
      const rows = await req.db!.execute(sql`
        SELECT
          o.order_id,
          o.order_number,
          o.customer_id,
          o.branch_id,
          o.status,
          o.priority,
          o.fulfillment_type,
          o.total,
          o.paid_amount,
          o.payment_status,
          o.received_at,
          o.confirmed_at,
          o.ready_at,
          o.promised_at,
          o.cancelled_at,
          o.delivered_at,
          c.customer_code,
          c.customer_type,
          c.first_name,
          c.last_name,
          c.business_name,
          c.phone,
          c.document_number
        FROM orders o
        LEFT JOIN customers c ON c.customer_id = o.customer_id
        WHERE 1=1
          ${status      ? sql`AND o.status = ${status}`                                       : sql``}
          ${customerId  ? sql`AND o.customer_id = ${customerId}::uuid`                        : sql``}
          ${branchId    ? sql`AND o.branch_id = ${branchId}::uuid`                            : sql``}
          ${date        ? sql`AND o.received_at::date = ${date}::date`                        : sql``}
          ${q ? sql`AND (
            o.order_number ILIKE ${'%' + q + '%'}
            OR c.first_name ILIKE ${'%' + q + '%'}
            OR c.last_name  ILIKE ${'%' + q + '%'}
            OR c.business_name ILIKE ${'%' + q + '%'}
            OR c.phone ILIKE ${'%' + q + '%'}
            OR c.document_number ILIKE ${'%' + q + '%'}
          )` : sql``}
        ORDER BY o.received_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      // Normalizar snake_case → camelCase e incluir info del cliente
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (rows.rows as any[]).map(r => ({
        orderId:         r.order_id,
        orderNumber:     r.order_number,
        customerId:      r.customer_id,
        branchId:        r.branch_id,
        status:          r.status,
        priority:        r.priority,
        fulfillmentType: r.fulfillment_type,
        total:           Number(r.total),
        paidAmount:      Number(r.paid_amount),
        paymentStatus:   r.payment_status,
        receivedAt:      r.received_at,
        confirmedAt:     r.confirmed_at ?? undefined,
        readyAt:         r.ready_at ?? undefined,
        promisedAt:      r.promised_at ?? undefined,
        cancelledAt:     r.cancelled_at ?? undefined,
        deliveredAt:     r.delivered_at ?? undefined,
        customer: {
          customerCode:   r.customer_code,
          customerType:   r.customer_type,
          firstName:      r.first_name,
          lastName:       r.last_name,
          businessName:   r.business_name,
          phone:          r.phone,
          documentNumber: r.document_number,
        },
      }));
      res.json(mapped);
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = createSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }
      const repo    = new DrizzleOrderRepository(req.db!);
      const useCase = new CreateOrderUseCase(repo);
      const result  = await useCase.execute({
        tenantId: req.tenant!.tenantId, receivedBy: req.user!.userId, ...body.data,
      });
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.get('/:orderId', async (req, res, next) => {
    try {
      const repo  = new DrizzleOrderRepository(req.db!);
      const order = await repo.findById(OrderId(req.params.orderId));
      if (!order) { res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' }); return; }

      // Enriquecer con datos del cliente
      const snap = order.toSnapshot();
      const customerRows = await req.db!.execute(
        sql`SELECT customer_code, customer_type, first_name, last_name, business_name, phone, email, document_number, document_type
            FROM customers WHERE customer_id = ${snap.customerId}::uuid LIMIT 1`
      );
      const customer = customerRows.rows[0] ?? null;

      res.json({ ...snap, customer });
    } catch (err) { next(err); }
  });

  router.post('/:orderId/lines', async (req, res, next) => {
    try {
      const body = lineSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }
      const repo    = new DrizzleOrderRepository(req.db!);
      const useCase = new AddOrderLineUseCase(repo);
      const result  = await useCase.execute({ orderId: req.params.orderId, ...body.data });
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.post('/:orderId/confirm', async (req, res, next) => {
    try {
      const repo    = new DrizzleOrderRepository(req.db!);
      const useCase = new ConfirmOrderUseCase(repo, eventBus);
      await useCase.execute({
        orderId: req.params.orderId, tenantId: req.tenant!.tenantId, confirmedBy: req.user!.userId,
      });
      res.status(204).send();
    } catch (err) { next(err); }
  });

  router.post('/:orderId/cancel', async (req, res, next) => {
    try {
      const body = cancelSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }
      const repo    = new DrizzleOrderRepository(req.db!);
      const useCase = new CancelOrderUseCase(repo, eventBus);
      await useCase.execute({
        orderId: req.params.orderId, tenantId: req.tenant!.tenantId,
        reason: body.data.reason, cancelledBy: req.user!.userId,
      });
      res.status(204).send();
    } catch (err) { next(err); }
  });

  router.post('/:orderId/deliver', async (req, res, next) => {
    try {
      const repo    = new DrizzleOrderRepository(req.db!);
      const useCase = new DeliverOrderUseCase(repo);
      await useCase.execute({ orderId: req.params.orderId });
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
