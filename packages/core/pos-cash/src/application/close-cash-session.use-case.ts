import { NotFoundError } from '@nexo/core-shared-kernel';

import type { CashSessionRepository } from '../domain/ports.js';

export interface CloseCashSessionInput {
  sessionId: string;
  closingBalance: number;
  closingDenominations?: Record<string, number>;
  closedBy: string;
  differenceReason?: string;
}

export interface CloseCashSessionResult {
  expectedCash: number;
  closingBalance: number;
  difference: number;
}

export class CloseCashSessionUseCase {
  constructor(private readonly sessions: CashSessionRepository) {}

  async execute(input: CloseCashSessionInput): Promise<CloseCashSessionResult> {
    const session = await this.sessions.findById(input.sessionId);
    if (!session) throw new NotFoundError('CashSession', input.sessionId);

    session.close({
      closingBalance:       input.closingBalance,
      closingDenominations: input.closingDenominations,
      closedBy:             input.closedBy,
      differenceReason:     input.differenceReason,
    });
    await this.sessions.save(session);

    const snap = session.toSnapshot();
    return {
      expectedCash:   snap.expectedCash ?? 0,
      closingBalance: snap.closingBalance ?? 0,
      difference:     snap.difference ?? 0,
    };
  }
}
