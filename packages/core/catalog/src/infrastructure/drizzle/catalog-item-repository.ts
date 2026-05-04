import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { CatalogItem, type CatalogItemType, type PricingModel, type UnitOfMeasure } from '../../domain/catalog-item.js';
import type { CatalogItemRepository } from '../../domain/ports.js';
import * as schema from './schema.js';

type Db = NodePgDatabase<typeof schema>;

export class DrizzleCatalogItemRepository implements CatalogItemRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<CatalogItem | null> {
    const rows = await this.db.select().from(schema.catalogItems)
      .where(eq(schema.catalogItems.itemId, id)).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async findByCode(code: string): Promise<CatalogItem | null> {
    const rows = await this.db.select().from(schema.catalogItems)
      .where(eq(schema.catalogItems.code, code.toUpperCase())).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async listActive(category?: string): Promise<CatalogItem[]> {
    const condition = category
      ? and(eq(schema.catalogItems.active, true), eq(schema.catalogItems.category, category))
      : eq(schema.catalogItems.active, true);
    const rows = await this.db.select().from(schema.catalogItems).where(condition);
    return rows.map(r => this.toAggregate(r));
  }

  async save(item: CatalogItem): Promise<void> {
    const s = item.toSnapshot();
    await this.db.insert(schema.catalogItems)
      .values({
        itemId:           s.itemId,
        code:             s.code,
        name:             s.name,
        description:      s.description ?? null,
        category:         s.category ?? null,
        itemType:         s.itemType,
        pricingModel:     s.pricingModel,
        unitOfMeasure:    s.unitOfMeasure,
        taxRate:          String(s.taxRate),
        taxIncluded:      s.taxIncluded,
        fulfillmentHints: s.fulfillmentHints,
        active:           s.active,
        extensions:       s.extensions,
        createdAt:        s.createdAt,
        updatedAt:        s.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.catalogItems.itemId,
        set: {
          name:             s.name,
          description:      s.description ?? null,
          category:         s.category ?? null,
          pricingModel:     s.pricingModel,
          active:           s.active,
          fulfillmentHints: s.fulfillmentHints,
          extensions:       s.extensions,
          updatedAt:        s.updatedAt,
        },
      });
  }

  private toAggregate(row: schema.CatalogItemRow): CatalogItem {
    return CatalogItem.rehydrate({
      itemId:           row.itemId,
      code:             row.code,
      name:             row.name,
      description:      row.description ?? undefined,
      category:         row.category ?? undefined,
      itemType:         row.itemType as CatalogItemType,
      pricingModel:     row.pricingModel as PricingModel,
      unitOfMeasure:    row.unitOfMeasure as UnitOfMeasure,
      taxRate:          Number(row.taxRate),
      taxIncluded:      row.taxIncluded,
      fulfillmentHints: row.fulfillmentHints as Record<string, unknown>,
      active:           row.active,
      extensions:       row.extensions as Record<string, unknown>,
      createdAt:        row.createdAt,
      updatedAt:        row.updatedAt,
    });
  }
}
