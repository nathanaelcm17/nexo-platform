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

  async execute(input: AdvanceStageInput): Promise<void> {
    const item = await this.productionItems.findById(input.productionItemId);
    if (!item) throw new NotFoundError('ProductionItem', input.productionItemId);

    const toStage = await this.stages.findById(input.toStageId);
    if (!toStage) throw new NotFoundError('Stage', input.toStageId);
    if (!toStage.active) throw new InvariantViolationError(`Stage '${toStage.name}' is inactive`);

    const fromStageId = item.currentStageId;

    // Registrar transición
    await this.productionItems.saveTransition({
      transitionId:    randomUUID(),
      productionItemId: item.productionItemId,
      fromStageId,
      toStageId:       input.toStageId,
      performedBy:     input.performedBy,
      rejected:        input.rejected ?? false,
      notes:           input.notes,
      occurredAt:      new Date(),
    });

    // Avanzar el item
    item.advanceStage(input.toStageId);
    await this.productionItems.save(item);

    // Si llegó a la etapa final, verificar si toda la work order está completa
    if (toStage.isFinal) {
      const workOrder = await this.workOrders.findById(item.workOrderId);
      if (workOrder) {
        const { total, completed } = await this.productionItems.countFinalStageItems(
          item.workOrderId,
          input.toStageId,
        );
        if (completed >= total) {
          workOrder.complete();
          await this.workOrders.save(workOrder);
        }
      }
    }
  }
}
