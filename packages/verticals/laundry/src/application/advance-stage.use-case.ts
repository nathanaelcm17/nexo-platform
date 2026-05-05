import { randomUUID } from 'node:crypto';

import { NotFoundError, InvariantViolationError } from '@nexo/core-shared-kernel';

import type { ProductionItemRepository, WorkOrderRepository, StageRepository } from '../domain/ports.js';

export interface AdvanceStageInput {
  productionItemId: string;
  toStageId: string;
  performedBy: string;
  rejected?: boolean;
  notes?: string;
}

export class AdvanceStageUseCase {
  constructor(
    private readonly productionItems: ProductionItemRepository,
    private readonly workOrders: WorkOrderRepository,
    private readonly stages: StageRepository,
  ) {}

  async execute(input: AdvanceStageInput): Promise<{ workOrderCompleted: boolean; workOrderStarted: boolean; orderId: string }> {
    const item = await this.productionItems.findById(input.productionItemId);
    if (!item) throw new NotFoundError('ProductionItem', input.productionItemId);

    const toStage = await this.stages.findById(input.toStageId);
    if (!toStage) throw new NotFoundError('Stage', input.toStageId);
    if (!toStage.active) throw new InvariantViolationError(`Stage '${toStage.name}' is inactive`);

    const fromStageId = item.currentStageId;

    await this.productionItems.saveTransition({
      transitionId:     randomUUID(),
      productionItemId: item.productionItemId,
      fromStageId,
      toStageId:        input.toStageId,
      performedBy:      input.performedBy,
      rejected:         input.rejected ?? false,
      notes:            input.notes,
      occurredAt:       new Date(),
    });

    item.advanceStage(input.toStageId);
    await this.productionItems.save(item);

    // Always load the work order to manage its lifecycle
    const workOrder = await this.workOrders.findById(item.workOrderId);
    if (!workOrder) throw new NotFoundError('WorkOrder', item.workOrderId);

    const orderId = workOrder.orderId;
    let workOrderStarted = false;
    let workOrderCompleted = false;

    // Start work order on the first item advance
    if (workOrder.status === 'pending') {
      workOrder.start();
      await this.workOrders.save(workOrder);
      workOrderStarted = true;
    }

    if (toStage.isFinal) {
      const { total, completed } = await this.productionItems.countFinalStageItems(
        item.workOrderId,
        input.toStageId,
      );
      if (completed >= total) {
        workOrder.complete();
        await this.workOrders.save(workOrder);
        workOrderCompleted = true;
      }
    }

    return { workOrderCompleted, workOrderStarted, orderId };
  }
}
