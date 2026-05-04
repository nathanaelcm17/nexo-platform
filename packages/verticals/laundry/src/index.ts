/**
 * NexoLaundry - Vertical Definition
 *
 * Paquete del vertical de lavandería. Se registra en el platform-runtime
 * mediante registerVertical(). Declara extensiones, permisos, suscripciones.
 *
 * IMPORTANTE: este paquete solo importa de @nexo/core-*, NUNCA de otros
 * verticales. Ver ADR-004 y ADR-009.
 */

import { z } from 'zod';
import type { VerticalDefinition } from '@nexo/core-platform-runtime';

// --- Extensiones del vertical ---

export const laundryCustomerExtensionSchema = z.object({
  starchPreference: z.enum(['none', 'light', 'medium', 'heavy']).optional(),
  perfumePreference: z.string().optional(),
  specialInstructions: z.string().max(500).optional(),
});

export const laundryCatalogItemExtensionSchema = z.object({
  requiresGarmentRegistration: z.boolean().default(false),
  defaultStages: z.array(z.string()).optional(),
  hazardousChemicals: z.boolean().default(false),
});

export const laundryOrderExtensionSchema = z.object({
  priorityNotes: z.string().optional(),
  pickupScheduled: z.string().datetime().optional(),
});

// --- Definición del vertical ---

export const laundryVertical: VerticalDefinition = {
  name: 'laundry',
  version: '0.1.0',
  fulfillmentType: 'laundry_production',
  requiredCoreVersion: '^0.1.0',

  aggregateExtensions: {
    customer: { schema: laundryCustomerExtensionSchema },
    catalogItem: { schema: laundryCatalogItemExtensionSchema },
    order: { schema: laundryOrderExtensionSchema },
  },

  eventSubscriptions: [
    {
      eventName: 'OrderConfirmed',
      handler: async (event) => {
        // TODO Fase 1: crear WorkOrder + ProductionItems
        console.log('[laundry] OrderConfirmed', event.aggregateId);
      },
    },
    {
      eventName: 'OrderCancelled',
      handler: async (event) => {
        console.log('[laundry] OrderCancelled', event.aggregateId);
      },
    },
  ],

  permissions: [
    { code: 'laundry:operations:view', description: 'Ver dashboard de producción', category: 'operations' },
    { code: 'laundry:operations:advance_stage', description: 'Avanzar etapa', category: 'operations' },
    { code: 'laundry:operations:quality_check', description: 'Aprobar QC', category: 'operations' },
  ],

  bootstrap: async (ctx) => {
    ctx.logger.info('[laundry] bootstrap completed');
  },
};
