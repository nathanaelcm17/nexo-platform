/**
 * Platform Runtime - Orquesta el registro de verticales (ADR-004).
 * Es la única pieza que conoce a todos: núcleo + adapters + verticales.
 */

import type { EventBus, DomainEvent } from '@nexo/core-shared-kernel';
import { z, type ZodSchema } from 'zod';
import semver from 'semver';

export interface PermissionDefinition {
  code: string;
  description: string;
  category: string;
}

export interface EventSubscription {
  eventName: string;
  minVersion?: string;
  handler: (event: DomainEvent) => Promise<void>;
}

export interface AggregateExtensionSchema {
  schema: ZodSchema;
  indexedFields?: string[];
}

export interface VerticalDefinition {
  name: string;
  version: string;
  fulfillmentType?: string;
  requiredCoreVersion: string;
  aggregateExtensions?: {
    customer?: AggregateExtensionSchema;
    catalogItem?: AggregateExtensionSchema;
    order?: AggregateExtensionSchema;
    orderLine?: AggregateExtensionSchema;
  };
  eventSubscriptions: EventSubscription[];
  permissions: PermissionDefinition[];
  bootstrap?: (ctx: PlatformContext) => Promise<void>;
  shutdown?: (ctx: PlatformContext) => Promise<void>;
}

export interface PlatformContext {
  readonly coreVersion: string;
  readonly eventBus: EventBus;
  readonly logger: Logger;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

const CORE_VERSION = '0.1.0';

export class Platform {
  private readonly verticals = new Map<string, VerticalDefinition>();
  private readonly fulfillmentTypes = new Set<string>();
  private readonly permissions = new Map<string, PermissionDefinition>();

  constructor(private readonly ctx: PlatformContext) {}

  registerVertical(def: VerticalDefinition): void {
    // ADR-006: validar compatibilidad de versión
    if (!semver.satisfies(this.ctx.coreVersion, def.requiredCoreVersion)) {
      throw new Error(
        `Vertical ${def.name} requires core ${def.requiredCoreVersion}, got ${this.ctx.coreVersion}`,
      );
    }
    if (this.verticals.has(def.name)) {
      throw new Error(`Vertical ${def.name} already registered`);
    }
    if (def.fulfillmentType && this.fulfillmentTypes.has(def.fulfillmentType)) {
      throw new Error(`Fulfillment type ${def.fulfillmentType} already taken`);
    }

    // Registrar permisos con validación de prefijo
    for (const perm of def.permissions) {
      if (!perm.code.startsWith(`${def.name}:`)) {
        throw new Error(
          `Permission ${perm.code} must be prefixed with ${def.name}:`,
        );
      }
      this.permissions.set(perm.code, perm);
    }

    // Suscribir handlers
    for (const sub of def.eventSubscriptions) {
      this.ctx.eventBus.subscribe(sub.eventName, sub.handler);
    }

    this.verticals.set(def.name, def);
    if (def.fulfillmentType) this.fulfillmentTypes.add(def.fulfillmentType);
    this.ctx.logger.info(`Vertical registered: ${def.name}@${def.version}`);
  }

  async bootstrapAll(): Promise<void> {
    for (const v of this.verticals.values()) {
      if (v.bootstrap) await v.bootstrap(this.ctx);
    }
  }

  async shutdownAll(): Promise<void> {
    for (const v of this.verticals.values()) {
      if (v.shutdown) await v.shutdown(this.ctx);
    }
  }

  validateExtension(aggregate: 'customer' | 'catalogItem' | 'order' | 'orderLine', verticalName: string, data: unknown): unknown {
    const vertical = this.verticals.get(verticalName);
    const schema = vertical?.aggregateExtensions?.[aggregate]?.schema;
    if (!schema) return data;
    return schema.parse(data);
  }

  getCoreVersion(): string {
    return CORE_VERSION;
  }
}
