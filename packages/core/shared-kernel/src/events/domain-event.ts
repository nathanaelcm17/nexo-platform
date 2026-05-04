/**
 * DomainEvent - Contrato base de todos los eventos de dominio (ADR-006).
 *
 * Versionado con SemVer. Los contextos publican eventos con contrato estable;
 * los cambios breaking requieren un período de dual publishing con upcasters.
 */

export interface DomainEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly eventName: string;
  readonly eventVersion: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion?: number;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly publishedBy: string;
  readonly payload: TPayload;
}

export interface EventBus {
  publish<T>(event: DomainEvent<T>): Promise<void>;
  subscribe<T>(
    eventName: string,
    handler: (event: DomainEvent<T>) => Promise<void>,
  ): void;
}

export interface EventUpcaster<TFrom = unknown, TTo = unknown> {
  readonly eventName: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  upcast(payload: TFrom): TTo;
}
