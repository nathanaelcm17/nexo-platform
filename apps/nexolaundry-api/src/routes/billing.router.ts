import { Router } from 'express';
import { z } from 'zod';

import {
  DrizzleInvoiceRepository,
  DrizzleNcfSequenceRepository,
  IssueInvoiceUseCase,
  CancelInvoiceUseCase,
} from '@nexo/core-billing';
import {
  DrizzlePaymentRepository,
  RecordPaymentUseCase,
} from '@nexo/core-payments';

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

const paymentSchema = z.object({
  amount:    z.number().positive(),
  method:    z.enum(['cash', 'card_manual', 'transfer', 'credit']),
  reference: z.string().optional(),
  notes:     z.string().optional(),
});

const cancelSchema = z.object({ reason: z.string().min(1) });

const listSchema = z.object({
  customerId: z.string().uuid().optional(),
  orderId:    z.string().uuid().optional(),
  status:     z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(100).optional(),
  offset:     z.coerce.number().int().min(0).optional(),
});

export function createBillingRouter(): Router {
  const router = Router();

  // --- Invoices ---

  router.get('/invoices', async (req, res, next) => {
    try {
      const q = listSchema.safeParse(req.query);
      if (!q.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: q.error.issues }); return; }
      const repo     = new DrizzleInvoiceRepository(req.db!);
      const invoices = await repo.list({
        customerId: q.data.customerId,
        orderId:    q.data.orderId,
        status:     q.data.status as never,
        limit:      q.data.limit,
        offset:     q.data.offset,
      });
      res.json(invoices.map(i => i.toSnapshot()));
    } catch (err) { next(err); }
  });

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

  router.post('/invoices/:id/payments', async (req, res, next) => {
    try {
      const body = paymentSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const invoiceRepo = new DrizzleInvoiceRepository(req.db!);
      const paymentRepo = new DrizzlePaymentRepository(req.db!);

      const invoice = await invoiceRepo.findById(req.params.id);
      if (!invoice) { res.status(404).json({ code: 'NOT_FOUND', message: 'Invoice not found' }); return; }

      // Registrar el pago
      const recordUseCase = new RecordPaymentUseCase(paymentRepo);
      const paymentId     = await recordUseCase.execute({
        invoiceId:  req.params.id,
        receivedBy: req.user!.userId,
        ...body.data,
      });

      // Actualizar estado de la factura según total pagado
      const totalPaid = await paymentRepo.sumByInvoiceId(req.params.id);
      const snap      = invoice.toSnapshot();
      const newStatus = totalPaid >= snap.total - 0.01 ? 'paid' : 'partially_paid';
      await invoiceRepo.updatePaymentStatus(req.params.id, newStatus);

      res.status(201).json({ paymentId, totalPaid, status: newStatus });
    } catch (err) { next(err); }
  });

  router.post('/invoices/:id/cancel', async (req, res, next) => {
    try {
      const body = cancelSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }
      const repo    = new DrizzleInvoiceRepository(req.db!);
      const useCase = new CancelInvoiceUseCase(repo);
      await useCase.execute({ invoiceId: req.params.id, reason: body.data.reason });
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
