import { Router } from 'express';
import { z } from 'zod';

import {
  DrizzleInvoiceRepository,
  DrizzleNcfSequenceRepository,
  IssueInvoiceUseCase,
} from '@nexo/core-billing';

const lineSchema = z.object({
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unitPrice:   z.number().nonnegative(),
  discount:    z.number().nonnegative().optional(),
  taxRate:     z.number().min(0).max(100),
});

const issueSchema = z.object({
  orderId:    z.string().uuid().optional(),
  customerId: z.string().uuid(),
  branchId:   z.string().uuid(),
  ncfType:    z.enum(['B01', 'B02', 'B04', 'B14', 'B15']),
  currency:   z.string().length(3).optional(),
  dueDate:    z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  lines:      z.array(lineSchema).min(1),
});

export function createBillingRouter(): Router {
  const router = Router();

  router.post('/invoices', async (req, res, next) => {
    try {
      const body = issueSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const invoiceRepo = new DrizzleInvoiceRepository(req.db!);
      const ncfRepo     = new DrizzleNcfSequenceRepository(req.db!);
      const useCase     = new IssueInvoiceUseCase(invoiceRepo, ncfRepo);
      const result      = await useCase.execute({ issuedBy: req.user!.userId, ...body.data });
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.get('/invoices/:id', async (req, res, next) => {
    try {
      const repo    = new DrizzleInvoiceRepository(req.db!);
      const invoice = await repo.findById(req.params.id);
      if (!invoice) { res.status(404).json({ code: 'NOT_FOUND', message: 'Invoice not found' }); return; }
      res.json(invoice.toSnapshot());
    } catch (err) { next(err); }
  });

  return router;
}
