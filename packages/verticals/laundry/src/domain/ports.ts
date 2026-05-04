import type { WorkOrder, ProductionItem } from './work-order.js';

export interface StageProps {
  stageId: string;
  name: string;
  order: number;
  estimatedDurationMin?: number;
  requiresQualityCheck: boolean;
  isInitial: boolean;
  isFinal: boolean;
  active: boolean;
}

export interface StageTransitionProps {
  transitionId: string;
  productionItemId: string;
  fromStageId?: string;
  toStageId: string;
  performedBy: string;
  rejected: boolean;
  notes?: string;
  occurredAt: Date;
}

export interface WorkOrderRepository {
  findById(id: string): Promise<WorkOrder | null>;
  findByOrderId(orderId: string): Promise<WorkOrder | null>;
  save(workOrder: WorkOrder): Promise<void>;
}

export interface ProductionItemRepository {
  findById(id: string): Promise<ProductionItem | null>;
  findByWorkOrder(workOrderId: string): Promise<ProductionItem[]>;
  save(item: ProductionItem): Promise<void>;
  saveTransition(transition: StageTransitionProps): Promise<void>;
  countFinalStageItems(workOrderId: string, finalStageId: string): Promise<{ total: number; completed: number }>;
}

export interface StageRepository {
  findById(id: string): Promise<StageProps | null>;
  findInitial(): Promise<StageProps | null>;
  findFinal(): Promise<StageProps | null>;
  listActive(): Promise<StageProps[]>;
}
