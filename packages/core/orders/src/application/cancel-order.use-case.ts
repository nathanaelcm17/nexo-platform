import { randomUUID } from 'node:crypto';

import { NotFoundError, OrderId } from '@nexo/core-shared-kernel';

import type { OrderRepository, EventBus } from '../domain/ports.js';

export class CancelOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: { orderId: string; tenantId: string; reason: string; cancelledBy: string }): Promise<void> {
    const order = await this.orders.findById(OrderId(input.orderId));
    if (!order) throw new NotFoundError('Order', input.orderId);

    const payload = order.cancel(input.reason);
    await this.orders.save(order);

    await this.eventBus.publish({
      eventId:       randomUUID(),
      eventName:     'OrderCancelled',
      eventVersion:  '1.0.0',
      aggregateType: 'Order',
      aggregateId:   order.orderId,
      tenantId:      input.tenantId,
      occurredAt:    new Date(),
      publishedBy:   input.cancelledBy,
      payload,
    });
  }
}
