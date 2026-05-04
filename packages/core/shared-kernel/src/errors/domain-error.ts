/**
 * DomainError - Error base para errores de dominio.
 * Los errores de infraestructura usan otra jerarquía.
 */

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvariantViolationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVARIANT_VIOLATION', message, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} not found: ${id}`, { resource, id });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super('FORBIDDEN', message);
  }
}
