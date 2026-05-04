import { randomUUID } from 'node:crypto';

import { InvariantViolationError } from '@nexo/core-shared-kernel';

export type WorkOrderStatus = 'pending' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

export interface ProductionItemSnapshot {
  productionItemId: string;
  workOrderId: string;
  orderLineId?: string;
  barcode: string;
  description: string;
  currentStageId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkOrderProps {
  workOrderId: string;
  orderId: string;
  branchId: string;
  priority: string;
  status: WorkOrderStatus;
  slaDeadline?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class WorkOrder {
  private constructor(private props: WorkOrderProps) {}

  static rehydrate(props: WorkOrderProps): WorkOrder {
    return new WorkOrder(props);
  }

  static create(input: {
    orderId: string;
    branchId: string;
    priority: string;
    slaDeadline?: Date;
  }): WorkOrder {
    const now = new Date();
    return new WorkOrder({
      workOrderId:  randomUUID(),
      orderId:      input.orderId,
      branchId:     input.branchId,
      priority:     input.priority,
      status:       'pending',
      slaDeadline:  input.slaDeadline,
      createdAt:    now,
      updatedAt:    now,
    });
  }

  start(): void {
    if (this.props.status !== 'pending') {
      throw new InvariantViolationError('WorkOrder must be pending to start');
    }
    this.props.status    = 'in_progress';
    this.props.startedAt = new Date();
    this.props.updatedAt = new Date();
  }

  complete(): void {
    this.props.status      = 'completed';
    this.props.completedAt = new Date();
    this.props.updatedAt   = new Date();
  }

  cancel(): void {
    this.props.status    = 'cancelled';
    this.props.updatedAt = new Date();
  }

  get workOrderId(): string { return this.props.workOrderId; }
  get orderId(): string     { return this.props.orderId; }
  get status(): WorkOrderStatus { return this.props.status; }

  toSnapshot(): Readonly<WorkOrderProps> { return { ...this.props }; }
}

export class ProductionItem {
  private constructor(private props: ProductionItemSnapshot) {}

  static rehydrate(props: ProductionItemSnapshot): ProductionItem {
    return new ProductionItem(props);
  }

  static create(input: {
    workOrderId: string;
    orderLineId?: string;
    description: string;
    initialStageId?: string;
  }): ProductionItem {
    const now = new Date();
    const seq = Math.floor(Math.random() * 900000 + 100000);
    return new ProductionItem({
      productionItemId: randomUUID(),
      workOrderId:      input.workOrderId,
      orderLineId:      input.orderLineId,
      barcode:          `NXL-${seq}`,
      description:      input.description,
      currentStageId:   input.initialStageId,
      createdAt:        now,
      updatedAt:        now,
    });
  }

  advanceStage(stageId: string): void {
    this.props.currentStageId = stageId;
    this.props.updatedAt      = new Date();
  }

  get productionItemId(): string { return this.props.productionItemId; }
  get workOrderId(): string      { return this.props.workOrderId; }
  get currentStageId(): string | undefined { return this.props.currentStageId; }

  toSnapshot(): Readonly<ProductionItemSnapshot> { return { ...this.props }; }
}
