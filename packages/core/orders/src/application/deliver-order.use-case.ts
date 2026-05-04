import { NotFoundError, OrderId } from '@nexo/core-shared-kernel';

import type { OrderRepository } from '../domain/ports.js';

export class DeliverOrderUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(input: { orderId: string }): Promise<void> {
    const order = await this.orders.findById(OrderId(input.orderId));
    if (!order) throw new NotFoundError('Order', input.orderId);
    order.deliver();
    await this.orders.save(order);
  }
}
