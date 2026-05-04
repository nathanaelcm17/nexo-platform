import type { CashSession } from './cash-session.js';

export interface CashSessionRepository {
  findById(id: string): Promise<CashSession | null>;
  findOpenByTerminal(terminalId: string): Promise<CashSession | null>;
  save(session: CashSession): Promise<void>;
}

export interface TerminalInfo {
  terminalId: string;
  branchId: string;
  name: string;
  deviceFingerprint?: string;
  active: boolean;
}

export interface TerminalRepository {
  findById(id: string): Promise<TerminalInfo | null>;
  findActiveByBranch(branchId: string): Promise<TerminalInfo[]>;
}
