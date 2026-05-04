import { InvariantViolationError } from '@nexo/core-shared-kernel';

export type CashSessionStatus  = 'open' | 'closing' | 'closed' | 'force_closed';
export type CashMovementType   = 'sale' | 'refund' | 'cash_in' | 'cash_out' | 'drop' | 'opening_float' | 'adjustment';
export type CashPaymentMethod  = 'cash' | 'card_manual' | 'transfer' | 'credit';

export interface CashMovementProps {
  movementId: string;
  sessionId: string;
  type: CashMovementType;
  amount: number;
  method?: CashPaymentMethod;
  relatedInvoiceId?: string;
  relatedOrderId?: string;
  description?: string;
  performedBy: string;
  occurredAt: Date;
}

export interface CashSessionProps {
  sessionId: string;
  terminalId: string;
  branchId: string;
  cashierId: string;
  status: CashSessionStatus;
  openedAt: Date;
  openingBalance: number;
  openingDenominations: Record<string, number>;
  closedAt?: Date;
  closingBalance?: number;
  closingDenominations?: Record<string, number>;
  expectedCash?: number;
  difference?: number;
  differenceReason?: string;
  closedBy?: string;
  supervisorApprovedBy?: string;
  movements: CashMovementProps[];
}

export class CashSession {
  private constructor(private props: CashSessionProps) {}

  static rehydrate(props: CashSessionProps): CashSession {
    return new CashSession(props);
  }

  static open(input: {
    sessionId: string;
    terminalId: string;
    branchId: string;
    cashierId: string;
    openingBalance: number;
    openingDenominations?: Record<string, number>;
  }): CashSession {
    if (input.openingBalance < 0) {
      throw new InvariantViolationError('Opening balance cannot be negative');
    }
    return new CashSession({
      sessionId:            input.sessionId,
      terminalId:           input.terminalId,
      branchId:             input.branchId,
      cashierId:            input.cashierId,
      status:               'open',
      openedAt:             new Date(),
      openingBalance:       input.openingBalance,
      openingDenominations: input.openingDenominations ?? {},
      movements:            [],
    });
  }

  recordMovement(input: {
    movementId: string;
    type: CashMovementType;
    amount: number;
    method?: CashPaymentMethod;
    relatedInvoiceId?: string;
    relatedOrderId?: string;
    description?: string;
    performedBy: string;
  }): void {
    if (this.props.status !== 'open') {
      throw new InvariantViolationError('Cannot record movements in a closed session');
    }
    if (input.amount <= 0) {
      throw new InvariantViolationError('Movement amount must be positive');
    }
    this.props.movements.push({ ...input, sessionId: this.props.sessionId, occurredAt: new Date() });
  }

  close(input: {
    closingBalance: number;
    closingDenominations?: Record<string, number>;
    closedBy: string;
    differenceReason?: string;
  }): void {
    if (this.props.status !== 'open') {
      throw new InvariantViolationError('Session is not open');
    }
    const expectedCash = this.computeExpectedCash();
    const difference   = Math.round((input.closingBalance - expectedCash) * 100) / 100;

    this.props.status               = 'closed';
    this.props.closedAt             = new Date();
    this.props.closingBalance       = input.closingBalance;
    this.props.closingDenominations = input.closingDenominations ?? {};
    this.props.expectedCash         = expectedCash;
    this.props.difference           = difference;
    this.props.differenceReason     = input.differenceReason;
    this.props.closedBy             = input.closedBy;
  }

  forceClose(supervisorId: string): void {
    this.props.status               = 'force_closed';
    this.props.closedAt             = new Date();
    this.props.supervisorApprovedBy = supervisorId;
  }

  private computeExpectedCash(): number {
    const cashMovements = this.props.movements.filter(
      m => !m.method || m.method === 'cash',
    );
    const inflows  = cashMovements.filter(m => ['sale', 'cash_in', 'opening_float'].includes(m.type));
    const outflows = cashMovements.filter(m => ['refund', 'cash_out', 'drop'].includes(m.type));
    const net = inflows.reduce((s, m) => s + m.amount, 0) - outflows.reduce((s, m) => s + m.amount, 0);
    return Math.round((this.props.openingBalance + net) * 100) / 100;
  }

  get sessionId(): string { return this.props.sessionId; }
  get status(): CashSessionStatus { return this.props.status; }
  get terminalId(): string { return this.props.terminalId; }
  get cashierId(): string { return this.props.cashierId; }
  get movements(): readonly CashMovementProps[] { return this.props.movements; }

  toSnapshot(): Readonly<CashSessionProps> {
    return { ...this.props, movements: [...this.props.movements] };
  }
}
