import { Router } from 'express';
import { z } from 'zod';

import {
  DrizzleWorkOrderRepository,
  DrizzleProductionItemRepository,
  DrizzleStageRepository,
  AdvanceStageUseCase,
} from '@nexo/vertical-laundry';
import { DrizzleOrderRepository } from '@nexo/core-orders';
import { OrderId } from '@nexo/core-shared-kernel';

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

  // GET /api/v1/laundry/work-orders — dashboard de producción (work orders activas con items)
  router.get('/work-orders', async (req, res, next) => {
    try {
      const workOrderRepo      = new DrizzleWorkOrderRepository(req.db!);
      const productionItemRepo = new DrizzleProductionItemRepository(req.db!);

      const workOrders = await workOrderRepo.listActive();
      const result     = await Promise.all(
        workOrders.map(async (wo) => {
          const items = await productionItemRepo.findByWorkOrder(wo.workOrderId);
          return { ...wo.toSnapshot(), items: items.map(i => i.toSnapshot()) };
        }),
      );
      res.json(result);
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

  // GET /api/v1/laundry/orders/:orderId/work-order — work order con items y trazabilidad
  router.get('/orders/:orderId/work-order', async (req, res, next) => {
    try {
      const workOrderRepo      = new DrizzleWorkOrderRepository(req.db!);
      const productionItemRepo = new DrizzleProductionItemRepository(req.db!);
      const stageRepo          = new DrizzleStageRepository(req.db!);

      const workOrder = await workOrderRepo.findByOrderId(req.params.orderId);
      if (!workOrder) { res.status(404).json({ code: 'NOT_FOUND', message: 'WorkOrder not found' }); return; }

      const [items, stages, transitions] = await Promise.all([
        productionItemRepo.findByWorkOrder(workOrder.workOrderId),
        stageRepo.listActive(),
        productionItemRepo.listTransitionsByWorkOrder(workOrder.workOrderId),
      ]);

      const stageMap = new Map(stages.map(s => [s.stageId, s.name]));

      const itemsWithHistory = items.map(i => {
        const snap = i.toSnapshot();
        const itemTransitions = transitions
          .filter(t => t.productionItemId === snap.productionItemId)
          .map(t => ({
            transitionId: t.transitionId,
            fromStage:    t.fromStageId ? stageMap.get(t.fromStageId) ?? t.fromStageId : null,
            toStage:      stageMap.get(t.toStageId) ?? t.toStageId,
            rejected:     t.rejected,
            notes:        t.notes,
            occurredAt:   t.occurredAt,
          }));
        return { ...snap, currentStageName: snap.currentStageId ? stageMap.get(snap.currentStageId) : null, transitions: itemTransitions };
      });

      res.json({ ...workOrder.toSnapshot(), items: itemsWithHistory });
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
      const result  = await useCase.execute({
        productionItemId: req.params.id,
        toStageId:        body.data.toStageId,
        performedBy:      req.user!.userId,
        rejected:         body.data.rejected,
        notes:            body.data.notes,
      });

      // Cuando la work order arranca, marcar la orden en producción
      if (result.workOrderStarted && result.orderId) {
        try {
          const orderRepo = new DrizzleOrderRepository(req.db!);
          const order = await orderRepo.findById(OrderId(result.orderId));
          if (order && order.toSnapshot().status === 'confirmed') {
            order.startFulfillment('laundry');
            await orderRepo.save(order);
          }
        } catch {
          // No bloquear la respuesta
        }
      }

      // Cuando la work order se completa, marcar la orden como lista para retiro
      if (result.workOrderCompleted && result.orderId) {
        try {
          const orderRepo = new DrizzleOrderRepository(req.db!);
          const order = await orderRepo.findById(OrderId(result.orderId));
          const status = order?.toSnapshot().status;
          if (order && status !== 'ready' && status !== 'delivered' && status !== 'cancelled') {
            order.markReady();
            await orderRepo.save(order);
          }
        } catch {
          // No bloquear la respuesta si falla el update del estado
        }
      }

      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
