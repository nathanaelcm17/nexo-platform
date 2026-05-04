import type { EventBus, OrderId } from '@nexo/core-shared-kernel';
import type { Order } from './order.js';

export { EventBus };

export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  findByNumber(number: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  nextOrderNumber(): Promise<string>;
}
