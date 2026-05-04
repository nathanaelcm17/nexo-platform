import type { EventBus, OrderId } from '@nexo/core-shared-kernel';
import type { Order, OrderStatus, OrderPriority, PaymentStatus } from './order.js';

export { EventBus };

export interface OrderListOptions {
  statuses?: OrderStatus[];
  customerId?: string;
  branchId?: string;
  limit?: number;
  offset?: number;
}

export interface OrderSummary {
  orderId: string;
  orderNumber: string;
  customerId: string;
  branchId: string;
  status: OrderStatus;
  priority: OrderPriority;
  fulfillmentType?: string;
  total: number;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  receivedAt: Date;
  promisedAt?: Date;
  confirmedAt?: Date;
  readyAt?: Date;
}

export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  findByNumber(number: string): Promise<Order | null>;
  list(opts: OrderListOptions): Promise<OrderSummary[]>;
  save(order: Order): Promise<void>;
  nextOrderNumber(): Promise<string>;
}
