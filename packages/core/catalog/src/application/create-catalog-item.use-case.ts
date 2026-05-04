import { randomUUID } from 'node:crypto';

import { InvariantViolationError } from '@nexo/core-shared-kernel';

import { CatalogItem, type CatalogItemType, type PricingModel, type UnitOfMeasure } from '../domain/catalog-item.js';
import type { CatalogItemRepository } from '../domain/ports.js';

export interface CreateCatalogItemInput {
  code: string;
  name: string;
  description?: string;
  category?: string;
  itemType?: CatalogItemType;
  pricingModel: PricingModel;
  unitOfMeasure?: UnitOfMeasure;
  taxRate?: number;
  taxIncluded?: boolean;
  fulfillmentHints?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export class CreateCatalogItemUseCase {
  constructor(private readonly items: CatalogItemRepository) {}

  async execute(input: CreateCatalogItemInput): Promise<string> {
    const existing = await this.items.findByCode(input.code.toUpperCase());
    if (existing) {
      throw new InvariantViolationError(`Catalog item with code '${input.code}' already exists`);
    }

    const item = CatalogItem.create({ itemId: randomUUID(), ...input });
    await this.items.save(item);
    return item.itemId;
  }
}
