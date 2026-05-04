import { WorkOrder, ProductionItem } from '../domain/work-order.js';
import type { WorkOrderRepository, ProductionItemRepository, StageRepository } from '../domain/ports.js';

export interface OrderLineInput {
  catalogItemId: string;
  quantity: number;
  unitOfMeasure: string;
  lineId?: string;
}

export interface CreateWorkOrderInput {
  orderId: string;
  branchId: string;
  priority: string;
  lines: OrderLineInput[];
  slaDeadline?: Date;
}

export class CreateWorkOrderUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly productionItems: ProductionItemRepository,
    private readonly stages: StageRepository,
  ) {}

  async execute(input: CreateWorkOrderInput): Promise<string> {
    const initialStage = await this.stages.findInitial();

    const workOrder = WorkOrder.create({
      orderId:     input.orderId,
      branchId:    input.branchId,
      priority:    input.priority,
      slaDeadline: input.slaDeadline,
    });

    await this.workOrders.save(workOrder);

    // Crear un ProductionItem por cada línea de la orden
    for (const line of input.lines) {
      const item = ProductionItem.create({
        workOrderId:    workOrder.workOrderId,
        orderLineId:    line.lineId,
        description:    `${line.unitOfMeasure} × ${line.quantity}`,
        initialStageId: initialStage?.stageId,
      });
      await this.productionItems.save(item);
    }

    return workOrder.workOrderId;
  }
}
