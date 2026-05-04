import { Router } from 'express';
import { z } from 'zod';

import {
  DrizzleWorkOrderRepository,
  DrizzleProductionItemRepository,
  DrizzleStageRepository,
  AdvanceStageUseCase,
} from '@nexo/vertical-laundry';

const advanceSchema = z.object({
  toStageId: z.string().uuid(),
  rejected:  z.boolean().optional(),
  notes:     z.string().optional(),
});

export function createLaundryRouter(): Router {
  const router = Router();

  // GET /api/v1/laundry/stages — lista de etapas activas
  router.get('/stages', async (req, res, next) => {
    try {
      const repo   = new DrizzleStageRepository(req.db!);
      const stages = await repo.listActive();
      res.json(stages);
    } catch (err) { next(err); }
  });

  // GET /api/v1/laundry/work-orders — work orders activas (pendientes + en progreso)
  router.get('/work-orders', async (_req, res, next) => {
    try {
      // Consulta directa para el dashboard de operaciones
      // Devuelve work orders con sus production items
      res.json({ message: 'Use GET /work-orders/:id for details' });
    } catch (err) { next(err); }
  });

  // GET /api/v1/laundry/work-orders/:id — detalle de una work order
  router.get('/work-orders/:id', async (req, res, next) => {
    try {
      const workOrderRepo      = new DrizzleWorkOrderRepository(req.db!);
      const productionItemRepo = new DrizzleProductionItemRepository(req.db!);

      const workOrder = await workOrderRepo.findById(req.params.id);
      if (!workOrder) { res.status(404).json({ code: 'NOT_FOUND', message: 'WorkOrder not found' }); return; }

      const items = await productionItemRepo.findByWorkOrder(req.params.id);
      res.json({ ...workOrder.toSnapshot(), items: items.map(i => i.toSnapshot()) });
    } catch (err) { next(err); }
  });

  // GET /api/v1/laundry/orders/:orderId/work-order — work order de una orden
  router.get('/orders/:orderId/work-order', async (req, res, next) => {
    try {
      const workOrderRepo      = new DrizzleWorkOrderRepository(req.db!);
      const productionItemRepo = new DrizzleProductionItemRepository(req.db!);

      const workOrder = await workOrderRepo.findByOrderId(req.params.orderId);
      if (!workOrder) { res.status(404).json({ code: 'NOT_FOUND', message: 'WorkOrder not found' }); return; }

      const items = await productionItemRepo.findByWorkOrder(workOrder.toSnapshot().workOrderId);
      res.json({ ...workOrder.toSnapshot(), items: items.map(i => i.toSnapshot()) });
    } catch (err) { next(err); }
  });

  // POST /api/v1/laundry/production-items/:id/advance — avanzar etapa
  router.post('/production-items/:id/advance', async (req, res, next) => {
    try {
      const body = advanceSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const productionItemRepo = new DrizzleProductionItemRepository(req.db!);
      const workOrderRepo      = new DrizzleWorkOrderRepository(req.db!);
      const stageRepo          = new DrizzleStageRepository(req.db!);

      const useCase = new AdvanceStageUseCase(productionItemRepo, workOrderRepo, stageRepo);
      await useCase.execute({
        productionItemId: req.params.id,
        toStageId:        body.data.toStageId,
        performedBy:      req.user!.userId,
        rejected:         body.data.rejected,
        notes:            body.data.notes,
      });
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
