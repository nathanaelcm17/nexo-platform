import { Router } from 'express';
import { z } from 'zod';

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
  limit:      z.coerce.number().int().min(1).max(100).optional(),
  offset:     z.coerce.number().int().min(0).optional(),
});

export function createOrdersRouter(eventBus: EventBus): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const q = listSchema.safeParse(req.query);
      if (!q.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: q.error.issues }); return; }
      const repo    = new DrizzleOrderRepository(req.db!);
      const results = await repo.list({
        statuses:   q.data.status ? [q.data.status as never] : undefined,
        customerId: q.data.customerId,
        branchId:   q.data.branchId,
        limit:      q.data.limit,
        offset:     q.data.offset,
      });
      res.json(results);
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
      res.json(order.toSnapshot());
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
