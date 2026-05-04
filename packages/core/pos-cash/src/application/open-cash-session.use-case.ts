import { randomUUID } from 'node:crypto';

import { InvariantViolationError } from '@nexo/core-shared-kernel';

import { CashSession } from '../domain/cash-session.js';
import type { CashSessionRepository } from '../domain/ports.js';

export interface OpenCashSessionInput {
  terminalId: string;
  branchId: string;
  cashierId: string;
  openingBalance: number;
  openingDenominations?: Record<string, number>;
}

export class OpenCashSessionUseCase {
  constructor(private readonly sessions: CashSessionRepository) {}

  async execute(input: OpenCashSessionInput): Promise<string> {
    const existing = await this.sessions.findOpenByTerminal(input.terminalId);
    if (existing) {
      throw new InvariantViolationError(`Terminal ${input.terminalId} already has an open session`);
    }

    const session = CashSession.open({ sessionId: randomUUID(), ...input });
    await this.sessions.save(session);
    return session.sessionId;
  }
}
