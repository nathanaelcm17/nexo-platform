import { Router } from 'express';
import { z } from 'zod';

import type { EventBus } from '@nexo/core-shared-kernel';
import { DrizzleOrderRepository, CreateOrderUseCase, ConfirmOrderUseCase, CancelOrderUseCase } from '@nexo/core-orders';

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

export function createOrdersRouter(eventBus: EventBus): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = createSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const repo    = new DrizzleOrderRepository(req.db!);
      const useCase = new CreateOrderUseCase(repo);
      const result  = await useCase.execute({
        tenantId:   req.tenant!.tenantId,
        receivedBy: req.user!.userId,
        ...body.data,
      });
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.post('/:orderId/confirm', async (req, res, next) => {
    try {
      const repo    = new DrizzleOrderRepository(req.db!);
      const useCase = new ConfirmOrderUseCase(repo, eventBus);
      await useCase.execute({
        orderId:     req.params.orderId,
        tenantId:    req.tenant!.tenantId,
        confirmedBy: req.user!.userId,
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
        orderId:     req.params.orderId,
        tenantId:    req.tenant!.tenantId,
        reason:      body.data.reason,
        cancelledBy: req.user!.userId,
      });
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
