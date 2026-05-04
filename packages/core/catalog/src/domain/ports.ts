import type { CatalogItem } from './catalog-item.js';

export interface CatalogItemRepository {
  findById(id: string): Promise<CatalogItem | null>;
  findByCode(code: string): Promise<CatalogItem | null>;
  listActive(category?: string): Promise<CatalogItem[]>;
  save(item: CatalogItem): Promise<void>;
}
