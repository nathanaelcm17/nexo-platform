import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { z } from 'zod';

import type { DomainEvent } from '@nexo/core-shared-kernel';
import type { VerticalDefinition } from '@nexo/core-platform-runtime';

import { CreateWorkOrderUseCase } from './application/create-work-order.use-case.js';
import {
  DrizzleWorkOrderRepository,
  DrizzleProductionItemRepository,
  DrizzleStageRepository,
} from './infrastructure/drizzle/repositories.js';
import * as laundrySchema from './infrastructure/drizzle/schema.js';

// ---------------------------------------------------------------------------
// Extensiones Zod del vertical (usadas por Platform.validateExtension)
// ---------------------------------------------------------------------------
export const laundryCustomerExtensionSchema = z.object({
  starchPreference:     z.enum(['none', 'light', 'medium', 'heavy']).optional(),
  perfumePreference:    z.string().optional(),
  specialInstructions:  z.string().max(500).optional(),
});

export const laundryCatalogItemExtensionSchema = z.object({
  requiresGarmentRegistration: z.boolean().default(false),
  defaultStages:               z.array(z.string()).optional(),
  hazardousChemicals:          z.boolean().default(false),
});

export const laundryOrderExtensionSchema = z.object({
  priorityNotes:    z.string().optional(),
  pickupScheduled:  z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Payload del evento OrderConfirmed (replicado localmente — ADR-006)
// ---------------------------------------------------------------------------
interface OrderConfirmedPayload {
  customerId: string;
  branchId: string;
  total: number;
  currency: string;
  fulfillmentType?: string;
  priority: string;
  lines: Array<{ catalogItemId: string; quantity: number; unitOfMeasure: string }>;
}


// ---------------------------------------------------------------------------
// Handler de OrderConfirmed — construye repos con search_path del tenant
// ---------------------------------------------------------------------------
function buildOrderConfirmedHandler(pool: Pool) {
  return async (event: DomainEvent): Promise<void> => {
    const payload = event.payload as OrderConfirmedPayload;

    // Solo procesar si el fulfillmentType corresponde a este vertical
    if (payload.fulfillmentType && payload.fulfillmentType !== 'laundry_production') return;

    // Resolver schema_name del tenant desde public.tenants
    const tenantResult = await pool.query<{ schema_name: string }>(
      'SELECT schema_name FROM public.tenants WHERE tenant_id = $1 LIMIT 1',
      [event.tenantId],
    );
    const schemaName = tenantResult.rows[0]?.schema_name;
    if (!schemaName) {
      console.error(`[laundry] tenant not found for tenantId=${event.tenantId}`);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO "${schemaName}", public`);
      const db = drizzle(client, { schema: laundrySchema });

      const workOrderRepo      = new DrizzleWorkOrderRepository(db);
      const productionItemRepo = new DrizzleProductionItemRepository(db);
      const stageRepo          = new DrizzleStageRepository(db);
      const useCase            = new CreateWorkOrderUseCase(workOrderRepo, productionItemRepo, stageRepo);

      await useCase.execute({
        orderId:  event.aggregateId,
        branchId: payload.branchId,
        priority: payload.priority,
        lines:    payload.lines.map(l => ({ ...l, lineId: undefined })),
      });

      console.log(JSON.stringify({
        level: 'info',
        msg:   '[laundry] WorkOrder created',
        orderId: event.aggregateId,
        tenant:  schemaName,
      }));
    } finally {
      client.release();
    }
  };
}

// ---------------------------------------------------------------------------
// Handler de OrderCancelled — cancela la WorkOrder en la DB
// ---------------------------------------------------------------------------
function buildOrderCancelledHandler(pool: Pool) {
  return async (event: DomainEvent): Promise<void> => {
    const tenantResult = await pool.query<{ schema_name: string }>(
      'SELECT schema_name FROM public.tenants WHERE tenant_id = $1 LIMIT 1',
      [event.tenantId],
    );
    const schemaName = tenantResult.rows[0]?.schema_name;
    if (!schemaName) {
      console.error(`[laundry] tenant not found for tenantId=${event.tenantId}`);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO "${schemaName}", public`);
      const db           = drizzle(client, { schema: laundrySchema });
      const workOrderRepo = new DrizzleWorkOrderRepository(db);
      const workOrder    = await workOrderRepo.findByOrderId(event.aggregateId);
      if (workOrder) {
        workOrder.cancel();
        await workOrderRepo.save(workOrder);
        console.log(JSON.stringify({ level: 'info', msg: '[laundry] WorkOrder cancelled', orderId: event.aggregateId }));
      }
    } finally {
      client.release();
    }
  };
}

// ---------------------------------------------------------------------------
// Factory — crea el vertical con el pool inyectado (para el API)
// ---------------------------------------------------------------------------
export function createLaundryVertical(pool: Pool): VerticalDefinition {
  return {
    name:                'laundry',
    version:             '0.1.0',
    fulfillmentType:     'laundry_production',
    requiredCoreVersion: '^0.1.0',

    aggregateExtensions: {
      customer:    { schema: laundryCustomerExtensionSchema },
      catalogItem: { schema: laundryCatalogItemExtensionSchema },
      order:       { schema: laundryOrderExtensionSchema },
    },

    eventSubscriptions: [
      {
        eventName: 'OrderConfirmed',
        handler:   buildOrderConfirmedHandler(pool),
      },
      {
        eventName: 'OrderCancelled',
        handler:   buildOrderCancelledHandler(pool),
      },
    ],

    permissions: [
      { code: 'laundry:operations:view',          description: 'Ver dashboard de producción',  category: 'operations' },
      { code: 'laundry:operations:advance_stage',  description: 'Avanzar etapa de producción', category: 'operations' },
      { code: 'laundry:operations:quality_check',  description: 'Aprobar control de calidad',  category: 'operations' },
    ],

    bootstrap: async (ctx) => {
      ctx.logger.info('[laundry] bootstrap completed');
    },
  };
}

// Exportar stub (sin pool) para tests unitarios o entornos sin DB
export const laundryVertical: VerticalDefinition = {
  name:                'laundry',
  version:             '0.1.0',
  fulfillmentType:     'laundry_production',
  requiredCoreVersion: '^0.1.0',
  aggregateExtensions: {
    customer:    { schema: laundryCustomerExtensionSchema },
    catalogItem: { schema: laundryCatalogItemExtensionSchema },
    order:       { schema: laundryOrderExtensionSchema },
  },
  eventSubscriptions: [
    {
      eventName: 'OrderConfirmed',
      handler:   async (event: DomainEvent) => {
        console.log('[laundry:stub] OrderConfirmed', event.aggregateId);
      },
    },
    {
      eventName: 'OrderCancelled',
      handler:   async (event: DomainEvent) => {
        console.log('[laundry:stub] OrderCancelled', event.aggregateId);
      },
    },
  ],
  permissions: [
    { code: 'laundry:operations:view',         description: 'Ver dashboard de producción',  category: 'operations' },
    { code: 'laundry:operations:advance_stage', description: 'Avanzar etapa',               category: 'operations' },
    { code: 'laundry:operations:quality_check', description: 'Aprobar QC',                  category: 'operations' },
  ],
  bootstrap: async (ctx) => {
    ctx.logger.info('[laundry:stub] bootstrap completed');
  },
};

// Re-exports del dominio y repos para uso desde el API
export * from './domain/work-order.js';
export * from './domain/ports.js';
export * from './application/create-work-order.use-case.js';
export * from './application/advance-stage.use-case.js';
export * from './infrastructure/drizzle/schema.js';
export * from './infrastructure/drizzle/repositories.js';
