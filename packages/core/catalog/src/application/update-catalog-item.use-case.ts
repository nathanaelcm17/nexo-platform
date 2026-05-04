import { NotFoundError } from '@nexo/core-shared-kernel';

import type { PricingModel } from '../domain/catalog-item.js';
import type { CatalogItemRepository } from '../domain/ports.js';

export interface UpdateCatalogItemInput {
  itemId: string;
  name?: string;
  description?: string;
  category?: string;
  pricingModel?: PricingModel;
  extensions?: Record<string, unknown>;
}

export class UpdateCatalogItemUseCase {
  constructor(private readonly items: CatalogItemRepository) {}

  async execute(input: UpdateCatalogItemInput): Promise<void> {
    const item = await this.items.findById(input.itemId);
    if (!item) throw new NotFoundError('CatalogItem', input.itemId);

    const hasDetails = input.name !== undefined || input.description !== undefined
      || input.category !== undefined || input.extensions !== undefined;

    if (hasDetails) {
      item.updateDetails({
        name:        input.name,
        description: input.description,
        category:    input.category,
        extensions:  input.extensions,
      });
    }
    if (input.pricingModel) item.updatePrice(input.pricingModel);

    await this.items.save(item);
  }
}
