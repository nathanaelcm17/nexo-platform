import { randomUUID } from 'node:crypto';

import { InvariantViolationError, OrderId } from '@nexo/core-shared-kernel';

import type { OrderConfirmedPayload, OrderCancelledPayload } from './events.js';

export type OrderStatus = 'draft' | 'confirmed' | 'in_fulfillment' | 'ready' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type OrderPriority = 'normal' | 'express' | 'same_day';
export type UnitOfMeasure = 'piece' | 'kg' | 'dozen' | 'hour' | 'unit';

export interface OrderLineProps {
  lineId: string;
  catalogItemId: string;
  description: string;
  quantity: number;
  unitOfMeasure: UnitOfMeasure;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
  extensions: Record<string, unknown>;
}

export interface OrderProps {
  orderId: OrderId;
  orderNumber: string;
  customerId: string;
  branchId: string;
  receivedBy: string;
  tenantId: string;
  status: OrderStatus;
  priority: OrderPriority;
  fulfillmentType?: string;
  fulfillmentRef?: string;
  subtotal: number;
  discount: number;
  taxTotal: number;
  total: number;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  notes?: string;
  cancelledReason?: string;
  promisedAt?: Date;
  receivedAt: Date;
  confirmedAt?: Date;
  readyAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  extensions: Record<string, unknown>;
  lines: OrderLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export class Order {
  private constructor(private props: OrderProps) {}

  static rehydrate(props: OrderProps): Order {
    return new Order(props);
  }

  static create(input: {
    orderId: OrderId;
    orderNumber: string;
    customerId: string;
    branchId: string;
    receivedBy: string;
    tenantId: string;
    priority?: OrderPriority;
    fulfillmentType?: string;
    notes?: string;
    promisedAt?: Date;
    extensions?: Record<string, unknown>;
  }): Order {
    const now = new Date();
    return new Order({
      orderId:       input.orderId,
      orderNumber:   input.orderNumber,
      customerId:    input.customerId,
      branchId:      input.branchId,
      receivedBy:    input.receivedBy,
      tenantId:      input.tenantId,
      status:        'draft',
      priority:      input.priority ?? 'normal',
      fulfillmentType: input.fulfillmentType,
      subtotal:      0,
      discount:      0,
      taxTotal:      0,
      total:         0,
      paymentStatus: 'unpaid',
      paidAmount:    0,
      notes:         input.notes,
      promisedAt:    input.promisedAt,
      extensions:    input.extensions ?? {},
      lines:         [],
      receivedAt:    now,
      createdAt:     now,
      updatedAt:     now,
    });
  }

  addLine(input: {
    catalogItemId: string;
    description: string;
    quantity: number;
    unitOfMeasure: UnitOfMeasure;
    unitPrice: number;
    discount?: number;
    taxRate: number;
    extensions?: Record<string, unknown>;
  }): string {
    if (this.props.status !== 'draft') {
      throw new InvariantViolationError('Lines can only be added to draft orders');
    }
    const lineId = randomUUID();
    const discount = input.discount ?? 0;
    const lineTotal = Math.round(((input.unitPrice * input.quantity) - discount) * 100) / 100;
    this.props.lines.push({
      lineId,
      catalogItemId: input.catalogItemId,
      description:   input.description,
      quantity:      input.quantity,
      unitOfMeasure: input.unitOfMeasure,
      unitPrice:     input.unitPrice,
      discount,
      taxRate:       input.taxRate,
      lineTotal,
      extensions:    input.extensions ?? {},
    });
    this.recalcTotals();
    return lineId;
  }

  removeLine(lineId: string): void {
    if (this.props.status !== 'draft') {
      throw new InvariantViolationError('Lines can only be removed from draft orders');
    }
    this.props.lines = this.props.lines.filter(l => l.lineId !== lineId);
    this.recalcTotals();
  }

  confirm(): OrderConfirmedPayload {
    if (this.props.status !== 'draft') {
      throw new InvariantViolationError(`Cannot confirm order in status '${this.props.status}'`);
    }
    if (this.props.lines.length === 0) {
      throw new InvariantViolationError('Cannot confirm order with no lines');
    }
    this.props.status = 'confirmed';
    this.props.confirmedAt = new Date();
    this.props.updatedAt = new Date();
    return {
      customerId:      this.props.customerId,
      branchId:        this.props.branchId,
      total:           this.props.total,
      currency:        'DOP',
      fulfillmentType: this.props.fulfillmentType,
      priority:        this.props.priority,
      lines: this.props.lines.map(l => ({
        catalogItemId: l.catalogItemId,
        quantity:      l.quantity,
        unitOfMeasure: l.unitOfMeasure,
      })),
    };
  }

  cancel(reason: string): OrderCancelledPayload {
    if (this.props.status === 'delivered' || this.props.status === 'cancelled') {
      throw new InvariantViolationError(`Cannot cancel order in status '${this.props.status}'`);
    }
    this.props.status = 'cancelled';
    this.props.cancelledReason = reason;
    this.props.cancelledAt = new Date();
    this.props.updatedAt = new Date();
    return { customerId: this.props.customerId, reason };
  }

  markReady(): void {
    if (this.props.status !== 'in_fulfillment' && this.props.status !== 'confirmed') {
      throw new InvariantViolationError(`Cannot mark ready order in status '${this.props.status}'`);
    }
    this.props.status = 'ready';
    this.props.readyAt = new Date();
    this.props.updatedAt = new Date();
  }

  startFulfillment(fulfillmentRef: string): void {
    if (this.props.status !== 'confirmed') {
      throw new InvariantViolationError('Order must be confirmed to start fulfillment');
    }
    this.props.status = 'in_fulfillment';
    this.props.fulfillmentRef = fulfillmentRef;
    this.props.updatedAt = new Date();
  }

  deliver(): void {
    if (this.props.status !== 'ready') {
      throw new InvariantViolationError('Order must be ready to be delivered');
    }
    this.props.status = 'delivered';
    this.props.deliveredAt = new Date();
    this.props.updatedAt = new Date();
  }

  recordPayment(amount: number): void {
    if (amount <= 0) throw new InvariantViolationError('Payment amount must be positive');
    this.props.paidAmount = Math.round((this.props.paidAmount + amount) * 100) / 100;
    if (this.props.paidAmount >= this.props.total - 0.01) {
      this.props.paymentStatus = 'paid';
    } else {
      this.props.paymentStatus = 'partial';
    }
    this.props.updatedAt = new Date();
  }

  private recalcTotals(): void {
    const subtotal = this.props.lines.reduce((acc, l) => acc + (l.unitPrice * l.quantity), 0);
    const discount = this.props.lines.reduce((acc, l) => acc + l.discount, 0);
    const taxTotal = this.props.lines.reduce((acc, l) => {
      const taxable = (l.unitPrice * l.quantity) - l.discount;
      return acc + Math.round(taxable * (l.taxRate / 100) * 100) / 100;
    }, 0);
    this.props.subtotal = Math.round(subtotal * 100) / 100;
    this.props.discount = Math.round(discount * 100) / 100;
    this.props.taxTotal = Math.round(taxTotal * 100) / 100;
    this.props.total    = Math.round((subtotal - discount + taxTotal) * 100) / 100;
    this.props.updatedAt = new Date();
  }

  get orderId(): OrderId  { return this.props.orderId; }
  get orderNumber(): string { return this.props.orderNumber; }
  get customerId(): string  { return this.props.customerId; }
  get status(): OrderStatus { return this.props.status; }
  get total(): number       { return this.props.total; }
  get lines(): readonly OrderLineProps[] { return this.props.lines; }
  get tenantId(): string    { return this.props.tenantId; }

  toSnapshot(): Readonly<OrderProps> { return { ...this.props, lines: [...this.props.lines] }; }
}
