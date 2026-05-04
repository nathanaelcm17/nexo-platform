import type { DomainEvent } from '@nexo/core-shared-kernel';

export interface OrderConfirmedPayload {
  customerId: string;
  branchId: string;
  total: number;
  currency: string;
  fulfillmentType?: string;
  priority: string;
  lines: Array<{ catalogItemId: string; quantity: number; unitOfMeasure: string }>;
}

export interface OrderCancelledPayload {
  customerId: string;
  reason?: string;
}

export interface OrderReadyPayload {
  customerId: string;
  orderNumber: string;
}

export type OrderConfirmedEvent = DomainEvent<OrderConfirmedPayload>;
export type OrderCancelledEvent = DomainEvent<OrderCancelledPayload>;
export type OrderReadyEvent     = DomainEvent<OrderReadyPayload>;
