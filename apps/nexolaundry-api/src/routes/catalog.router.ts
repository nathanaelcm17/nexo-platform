import { Router } from 'express';
import { z } from 'zod';

import { DrizzleCatalogItemRepository, CreateCatalogItemUseCase } from '@nexo/core-catalog';

const pricingModelSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'),      price: z.number().nonnegative() }),
  z.object({ kind: z.literal('per_unit'),   unitPrice: z.number().nonnegative() }),
  z.object({ kind: z.literal('per_weight'), pricePerKg: z.number().nonnegative(), minKg: z.number().optional() }),
  z.object({ kind: z.literal('package'),    packagePrice: z.number().nonnegative() }),
]);

const createSchema = z.object({
  code:             z.string().min(1).max(30),
  name:             z.string().min(1).max(200),
  description:      z.string().optional(),
  category:         z.string().optional(),
  itemType:         z.enum(['service', 'product', 'package']).optional(),
  pricingModel:     pricingModelSchema,
  unitOfMeasure:    z.enum(['piece', 'kg', 'dozen', 'hour', 'unit']).optional(),
  taxRate:          z.number().min(0).max(100).optional(),
  taxIncluded:      z.boolean().optional(),
  fulfillmentHints: z.record(z.unknown()).optional(),
  extensions:       z.record(z.unknown()).optional(),
});

export function createCatalogRouter(): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = createSchema.safeParse(req.body);
      if (!body.success) { res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues }); return; }

      const repo    = new DrizzleCatalogItemRepository(req.db!);
      const useCase = new CreateCatalogItemUseCase(repo);
      const id      = await useCase.execute(body.data);
      res.status(201).json({ itemId: id });
    } catch (err) { next(err); }
  });

  router.get('/', async (req, res, next) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const repo     = new DrizzleCatalogItemRepository(req.db!);
      const items    = await repo.listActive(category);
      res.json(items.map((i: { toSnapshot(): unknown }) => i.toSnapshot()));
    } catch (err) { next(err); }
  });

  return router;
}
