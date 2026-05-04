import { randomUUID } from 'node:crypto';

import { NotFoundError } from '@nexo/core-shared-kernel';

import type { CashMovementType, CashPaymentMethod } from '../domain/cash-session.js';
import type { CashSessionRepository } from '../domain/ports.js';

export interface RecordMovementInput {
  sessionId: string;
  type: CashMovementType;
  amount: number;
  method?: CashPaymentMethod;
  relatedInvoiceId?: string;
  relatedOrderId?: string;
  description?: string;
  performedBy: string;
}

export class RecordMovementUseCase {
  constructor(private readonly sessions: CashSessionRepository) {}

  async execute(input: RecordMovementInput): Promise<string> {
    const session = await this.sessions.findById(input.sessionId);
    if (!session) throw new NotFoundError('CashSession', input.sessionId);

    const movementId = randomUUID();
    session.recordMovement({ movementId, ...input });
    await this.sessions.save(session);
    return movementId;
  }
}
