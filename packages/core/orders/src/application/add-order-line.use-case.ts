import { NotFoundError, OrderId } from '@nexo/core-shared-kernel';

import type { UnitOfMeasure } from '../domain/order.js';
import type { OrderRepository } from '../domain/ports.js';

export interface AddOrderLineInput {
  orderId: string;
  catalogItemId: string;
  description: string;
  quantity: number;
  unitOfMeasure: UnitOfMeasure;
  unitPrice: number;
  discount?: number;
  taxRate: number;
  extensions?: Record<string, unknown>;
}

export class AddOrderLineUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(input: AddOrderLineInput): Promise<{ lineId: string; total: number }> {
    const order = await this.orders.findById(OrderId(input.orderId));
    if (!order) throw new NotFoundError('Order', input.orderId);

    const lineId = order.addLine({
      catalogItemId: input.catalogItemId,
      description:   input.description,
      quantity:      input.quantity,
      unitOfMeasure: input.unitOfMeasure,
      unitPrice:     input.unitPrice,
      discount:      input.discount,
      taxRate:       input.taxRate,
      extensions:    input.extensions,
    });

    await this.orders.save(order);
    return { lineId, total: order.total };
  }
}
