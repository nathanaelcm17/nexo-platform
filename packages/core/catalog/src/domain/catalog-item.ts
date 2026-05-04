import { InvariantViolationError } from '@nexo/core-shared-kernel';

export type CatalogItemType = 'service' | 'product' | 'package';
export type UnitOfMeasure = 'piece' | 'kg' | 'dozen' | 'hour' | 'unit';

export type PricingModel =
  | { kind: 'fixed'; price: number }
  | { kind: 'per_unit'; unitPrice: number }
  | { kind: 'per_weight'; pricePerKg: number; minKg?: number }
  | { kind: 'package'; packagePrice: number };

export interface CatalogItemProps {
  itemId: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  itemType: CatalogItemType;
  pricingModel: PricingModel;
  unitOfMeasure: UnitOfMeasure;
  taxRate: number;
  taxIncluded: boolean;
  fulfillmentHints: Record<string, unknown>;
  active: boolean;
  extensions: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class CatalogItem {
  private constructor(private props: CatalogItemProps) {}

  static rehydrate(props: CatalogItemProps): CatalogItem {
    return new CatalogItem(props);
  }

  static create(input: {
    itemId: string;
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
  }): CatalogItem {
    if (!input.code.trim()) throw new InvariantViolationError('Item code is required');
    if (!input.name.trim()) throw new InvariantViolationError('Item name is required');
    if (input.pricingModel.kind === 'fixed' && input.pricingModel.price < 0) {
      throw new InvariantViolationError('Price cannot be negative');
    }
    const now = new Date();
    return new CatalogItem({
      itemId:          input.itemId,
      code:            input.code.trim().toUpperCase(),
      name:            input.name.trim(),
      description:     input.description,
      category:        input.category,
      itemType:        input.itemType ?? 'service',
      pricingModel:    input.pricingModel,
      unitOfMeasure:   input.unitOfMeasure ?? 'piece',
      taxRate:         input.taxRate ?? 18,
      taxIncluded:     input.taxIncluded ?? false,
      fulfillmentHints: input.fulfillmentHints ?? {},
      active:          true,
      extensions:      input.extensions ?? {},
      createdAt:       now,
      updatedAt:       now,
    });
  }

  updatePrice(pricingModel: PricingModel): void {
    this.props.pricingModel = pricingModel;
    this.props.updatedAt = new Date();
  }

  updateDetails(input: { name?: string; description?: string; category?: string; extensions?: Record<string, unknown> }): void {
    if (input.name) this.props.name = input.name.trim();
    if (input.description !== undefined) this.props.description = input.description;
    if (input.category !== undefined) this.props.category = input.category;
    if (input.extensions !== undefined) this.props.extensions = input.extensions;
    this.props.updatedAt = new Date();
  }

  deactivate(): void { this.props.active = false; this.props.updatedAt = new Date(); }
  activate(): void   { this.props.active = true;  this.props.updatedAt = new Date(); }

  /** Calcula el precio base para una cantidad dada según el modelo */
  calculatePrice(quantity: number): number {
    const pm = this.props.pricingModel;
    switch (pm.kind) {
      case 'fixed':      return pm.price;
      case 'per_unit':   return pm.unitPrice * quantity;
      case 'per_weight': return pm.pricePerKg * Math.max(quantity, pm.minKg ?? 0);
      case 'package':    return pm.packagePrice;
    }
  }

  get itemId(): string { return this.props.itemId; }
  get code(): string { return this.props.code; }
  get name(): string { return this.props.name; }
  get active(): boolean { return this.props.active; }
  get taxRate(): number { return this.props.taxRate; }
  get taxIncluded(): boolean { return this.props.taxIncluded; }
  get unitOfMeasure(): UnitOfMeasure { return this.props.unitOfMeasure; }
  get pricingModel(): PricingModel { return this.props.pricingModel; }

  toSnapshot(): Readonly<CatalogItemProps> { return { ...this.props }; }
}
