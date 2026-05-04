import { Router } from 'express';
import { z } from 'zod';

import {
  DrizzleCashSessionRepository,
  OpenCashSessionUseCase,
  RecordMovementUseCase,
  CloseCashSessionUseCase,
} from '@nexo/core-pos-cash';

const openSchema = z.object({
  terminalId:           z.string().uuid(),
  branchId:             z.string().uuid(),
  openingBalance:       z.number().nonnegative(),
  openingDenominations: z.record(z.number()).optional(),
});

const movementSchema = z.object({
  type:             z.enum(['sale', 'refund', 'cash_in', 'cash_out', 'drop', 'opening_float', 'adjustment']),
  amount:           z.number().positive(),
  method:           z.enum(['cash', 'card_manual', 'transfer', 'credit']).optional(),
  relatedInvoiceId: z.string().uuid().optional(),
  relatedOrderId:   z.string().uuid().optional(),
  description:      z.string().optional(),
});

const closeSchema = z.object({
  closingBalance:       z.number().nonnegative(),
  closingDenominations: z.record(z.number()).optional(),
  differenceReason:     z.string().optional(),
});

export function createCashRouter(): Router {
  const router = Router();

  router.post('/sessions', async (req, res, next) => {
    try {
      const body = openSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const repo      = new DrizzleCashSessionRepository(req.db!);
      const useCase   = new OpenCashSessionUseCase(repo);
      const sessionId = await useCase.execute({ cashierId: req.user!.userId, ...body.data });
      res.status(201).json({ sessionId });
    } catch (err) { next(err); }
  });

  router.post('/sessions/:sessionId/movements', async (req, res, next) => {
    try {
      const body = movementSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const repo       = new DrizzleCashSessionRepository(req.db!);
      const useCase    = new RecordMovementUseCase(repo);
      const movementId = await useCase.execute({
        sessionId:   req.params.sessionId,
        performedBy: req.user!.userId,
        ...body.data,
      });
      res.status(201).json({ movementId });
    } catch (err) { next(err); }
  });

  router.post('/sessions/:sessionId/close', async (req, res, next) => {
    try {
      const body = closeSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const repo    = new DrizzleCashSessionRepository(req.db!);
      const useCase = new CloseCashSessionUseCase(repo);
      const result  = await useCase.execute({
        sessionId: req.params.sessionId,
        closedBy:  req.user!.userId,
        ...body.data,
      });
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}
