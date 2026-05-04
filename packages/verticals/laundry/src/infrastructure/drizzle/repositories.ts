import { and, count, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { WorkOrder, ProductionItem, type WorkOrderStatus } from '../../domain/work-order.js';
import type {
  WorkOrderRepository,
  ProductionItemRepository,
  StageRepository,
  StageProps,
  StageTransitionProps,
} from '../../domain/ports.js';
import * as schema from './schema.js';

type Db = NodePgDatabase<typeof schema>;

// ---------------------------------------------------------------------------
// WorkOrderRepository
// ---------------------------------------------------------------------------
export class DrizzleWorkOrderRepository implements WorkOrderRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<WorkOrder | null> {
    const rows = await this.db.select().from(schema.workOrders)
      .where(eq(schema.workOrders.workOrderId, id)).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async findByOrderId(orderId: string): Promise<WorkOrder | null> {
    const rows = await this.db.select().from(schema.workOrders)
      .where(eq(schema.workOrders.orderId, orderId)).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async save(workOrder: WorkOrder): Promise<void> {
    const s = workOrder.toSnapshot();
    await this.db.insert(schema.workOrders)
      .values({
        workOrderId: s.workOrderId,
        orderId:     s.orderId,
        branchId:    s.branchId,
        priority:    s.priority,
        status:      s.status,
        slaDeadline: s.slaDeadline ?? null,
        startedAt:   s.startedAt ?? null,
        completedAt: s.completedAt ?? null,
        createdAt:   s.createdAt,
        updatedAt:   s.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.workOrders.workOrderId,
        set: {
          status:      s.status,
          startedAt:   s.startedAt ?? null,
          completedAt: s.completedAt ?? null,
          updatedAt:   s.updatedAt,
        },
      });
  }

  private toAggregate(row: schema.WorkOrderRow): WorkOrder {
    return WorkOrder.rehydrate({
      workOrderId:  row.workOrderId,
      orderId:      row.orderId,
      branchId:     row.branchId,
      priority:     row.priority,
      status:       row.status as WorkOrderStatus,
      slaDeadline:  row.slaDeadline ?? undefined,
      startedAt:    row.startedAt ?? undefined,
      completedAt:  row.completedAt ?? undefined,
      createdAt:    row.createdAt,
      updatedAt:    row.updatedAt,
    });
  }
}

// ---------------------------------------------------------------------------
// ProductionItemRepository
// ---------------------------------------------------------------------------
export class DrizzleProductionItemRepository implements ProductionItemRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<ProductionItem | null> {
    const rows = await this.db.select().from(schema.productionItems)
      .where(eq(schema.productionItems.productionItemId, id)).limit(1);
    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async findByWorkOrder(workOrderId: string): Promise<ProductionItem[]> {
    const rows = await this.db.select().from(schema.productionItems)
      .where(eq(schema.productionItems.workOrderId, workOrderId));
    return rows.map(r => this.toAggregate(r));
  }

  async save(item: ProductionItem): Promise<void> {
    const s = item.toSnapshot();
    await this.db.insert(schema.productionItems)
      .values({
        productionItemId: s.productionItemId,
        workOrderId:      s.workOrderId,
        orderLineId:      s.orderLineId ?? null,
        barcode:          s.barcode,
        description:      s.description,
        currentStageId:   s.currentStageId ?? null,
        notes:            s.notes ?? null,
        createdAt:        s.createdAt,
        updatedAt:        s.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.productionItems.productionItemId,
        set: {
          currentStageId: s.currentStageId ?? null,
          notes:          s.notes ?? null,
          updatedAt:      s.updatedAt,
        },
      });
  }

  async saveTransition(t: StageTransitionProps): Promise<void> {
    await this.db.insert(schema.stageTransitions).values({
      transitionId:     t.transitionId,
      productionItemId: t.productionItemId,
      fromStageId:      t.fromStageId ?? null,
      toStageId:        t.toStageId,
      performedBy:      t.performedBy,
      rejected:         t.rejected,
      notes:            t.notes ?? null,
      occurredAt:       t.occurredAt,
    });
  }

  async countFinalStageItems(workOrderId: string, finalStageId: string): Promise<{ total: number; completed: number }> {
    const [totalRows, completedRows] = await Promise.all([
      this.db.select({ c: count() }).from(schema.productionItems)
        .where(eq(schema.productionItems.workOrderId, workOrderId)),
      this.db.select({ c: count() }).from(schema.productionItems)
        .where(and(
          eq(schema.productionItems.workOrderId, workOrderId),
          eq(schema.productionItems.currentStageId, finalStageId),
        )),
    ]);
    return { total: Number(totalRows[0]?.c ?? 0), completed: Number(completedRows[0]?.c ?? 0) };
  }

  private toAggregate(row: schema.ProductionItemRow): ProductionItem {
    return ProductionItem.rehydrate({
      productionItemId: row.productionItemId,
      workOrderId:      row.workOrderId,
      orderLineId:      row.orderLineId ?? undefined,
      barcode:          row.barcode ?? '',
      description:      row.description ?? '',
      currentStageId:   row.currentStageId ?? undefined,
      notes:            row.notes ?? undefined,
      createdAt:        row.createdAt,
      updatedAt:        row.updatedAt,
    });
  }
}

// ---------------------------------------------------------------------------
// StageRepository
// ---------------------------------------------------------------------------
export class DrizzleStageRepository implements StageRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<StageProps | null> {
    const rows = await this.db.select().from(schema.stages)
      .where(eq(schema.stages.stageId, id)).limit(1);
    return rows[0] ? this.toProps(rows[0]) : null;
  }

  async findInitial(): Promise<StageProps | null> {
    const rows = await this.db.select().from(schema.stages)
      .where(and(eq(schema.stages.isInitial, true), eq(schema.stages.active, true))).limit(1);
    return rows[0] ? this.toProps(rows[0]) : null;
  }

  async findFinal(): Promise<StageProps | null> {
    const rows = await this.db.select().from(schema.stages)
      .where(and(eq(schema.stages.isFinal, true), eq(schema.stages.active, true))).limit(1);
    return rows[0] ? this.toProps(rows[0]) : null;
  }

  async listActive(): Promise<StageProps[]> {
    const rows = await this.db.select().from(schema.stages)
      .where(eq(schema.stages.active, true));
    return rows.map(r => this.toProps(r));
  }

  private toProps(row: schema.StageRow): StageProps {
    return {
      stageId:              row.stageId,
      name:                 row.name,
      order:                row.order,
      estimatedDurationMin: row.estimatedDurationMin ?? undefined,
      requiresQualityCheck: row.requiresQualityCheck,
      isInitial:            row.isInitial,
      isFinal:              row.isFinal,
      active:               row.active,
    };
  }
}
