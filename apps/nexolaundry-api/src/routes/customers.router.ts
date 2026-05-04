import { Router } from 'express';
import { z } from 'zod';

import { DrizzleCustomerRepository, CreateCustomerUseCase, SearchCustomersUseCase } from '@nexo/core-customers';

const createSchema = z.object({
  customerType:   z.enum(['individual', 'business']),
  firstName:      z.string().min(1).optional(),
  lastName:       z.string().optional(),
  businessName:   z.string().min(1).optional(),
  documentType:   z.enum(['cedula', 'rnc', 'passport']).optional(),
  documentNumber: z.string().optional(),
  phone:          z.string().optional(),
  email:          z.string().email().optional(),
  creditLimit:    z.number().nonnegative().optional(),
  notes:          z.string().optional(),
  extensions:     z.record(z.unknown()).optional(),
});

const searchSchema = z.object({
  q:       z.string().optional(),
  phone:   z.string().optional(),
  doc:     z.string().optional(),
  limit:   z.coerce.number().int().min(1).max(100).optional(),
  offset:  z.coerce.number().int().min(0).optional(),
});

export function createCustomersRouter(): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = createSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const repo    = new DrizzleCustomerRepository(req.db!);
      const useCase = new CreateCustomerUseCase(repo);
      const result  = await useCase.execute({ tenantId: req.tenant!.tenantId, ...body.data });
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  router.get('/', async (req, res, next) => {
    try {
      const query   = searchSchema.safeParse(req.query);
      if (!query.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: query.error.issues }); return; }

      const repo    = new DrizzleCustomerRepository(req.db!);
      const useCase = new SearchCustomersUseCase(repo);
      const results = await useCase.execute({
        query:          query.data.q,
        phone:          query.data.phone,
        documentNumber: query.data.doc,
        limit:          query.data.limit,
        offset:         query.data.offset,
      });
      res.json(results.map(c => c.toSnapshot()));
    } catch (err) { next(err); }
  });

  return router;
}
