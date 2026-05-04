import { randomUUID } from 'node:crypto';

import { OrderId } from '@nexo/core-shared-kernel';

import { Order, type OrderPriority, type UnitOfMeasure } from '../domain/order.js';
import type { OrderRepository } from '../domain/ports.js';

export interface AddLineInput {
  catalogItemId: string;
  description: string;
  quantity: number;
  unitOfMeasure: UnitOfMeasure;
  unitPrice: number;
  discount?: number;
  taxRate: number;
  extensions?: Record<string, unknown>;
}

export interface CreateOrderInput {
  tenantId: string;
  customerId: string;
  branchId: string;
  receivedBy: string;
  priority?: OrderPriority;
  fulfillmentType?: string;
  notes?: string;
  promisedAt?: Date;
  extensions?: Record<string, unknown>;
  lines: AddLineInput[];
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  total: number;
}

export class CreateOrderUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(input: CreateOrderInput): Promise<CreateOrderResult> {
    const orderNumber = await this.orders.nextOrderNumber();
    const order = Order.create({
      orderId:        OrderId(randomUUID()),
      orderNumber,
      customerId:     input.customerId,
      branchId:       input.branchId,
      receivedBy:     input.receivedBy,
      tenantId:       input.tenantId,
      priority:       input.priority,
      fulfillmentType: input.fulfillmentType,
      notes:          input.notes,
      promisedAt:     input.promisedAt,
      extensions:     input.extensions,
    });

    for (const line of input.lines) {
      order.addLine(line);
    }

    await this.orders.save(order);
    return { orderId: order.orderId, orderNumber: order.orderNumber, total: order.total };
  }
}
