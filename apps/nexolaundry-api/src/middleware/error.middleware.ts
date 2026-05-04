import type { Request, Response, NextFunction } from 'express';
import {
  DomainError,
  NotFoundError,
  ForbiddenError,
  InvariantViolationError,
} from '@nexo/core-shared-kernel';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(401).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof InvariantViolationError) {
    res.status(422).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof DomainError) {
    res.status(400).json({ code: err.code, message: err.message });
    return;
  }

  // Error inesperado — no filtrar detalles en producción
  const isProd = process.env.NODE_ENV === 'production';
  console.error(JSON.stringify({ level: 'error', msg: 'Unhandled error', err: String(err) }));
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: isProd ? 'Internal server error' : String(err),
  });
}
