import { InvariantViolationError } from '@nexo/core-shared-kernel';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'credit_noted';
export type NcfType = 'B01' | 'B02' | 'B04' | 'B14' | 'B15';

export interface InvoiceLineProps {
  lineId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
}

export interface InvoiceProps {
  invoiceId: string;
  invoiceNumber: string;
  orderId?: string;
  customerId: string;
  branchId: string;
  ncf: string;
  ncfType: NcfType;
  issueDate: Date;
  dueDate?: Date;
  currency: string;
  subtotal: number;
  itbis: number;
  totalExempt: number;
  total: number;
  status: InvoiceStatus;
  issuedBy: string;
  cancelledAt?: Date;
  cancelledReason?: string;
  lines: InvoiceLineProps[];
  createdAt: Date;
}

export class Invoice {
  private constructor(private props: InvoiceProps) {}

  static rehydrate(props: InvoiceProps): Invoice {
    return new Invoice(props);
  }

  static create(input: {
    invoiceId: string;
    invoiceNumber: string;
    orderId?: string;
    customerId: string;
    branchId: string;
    ncf: string;
    ncfType: NcfType;
    currency?: string;
    issuedBy: string;
    dueDate?: Date;
    lines: Array<{ lineId: string; description: string; quantity: number; unitPrice: number; discount?: number; taxRate: number }>;
  }): Invoice {
    if (input.lines.length === 0) {
      throw new InvariantViolationError('Invoice must have at least one line');
    }

    const lines: InvoiceLineProps[] = input.lines.map(l => {
      const lineTotal = Math.round(((l.unitPrice * l.quantity) - (l.discount ?? 0)) * 100) / 100;
      return { ...l, discount: l.discount ?? 0, lineTotal };
    });

    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const discount = lines.reduce((s, l) => s + l.discount, 0);
    const itbis    = lines.reduce((s, l) => {
      const taxable = (l.unitPrice * l.quantity) - l.discount;
      return s + Math.round(taxable * (l.taxRate / 100) * 100) / 100;
    }, 0);

    const now = new Date();
    return new Invoice({
      invoiceId:     input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      orderId:       input.orderId,
      customerId:    input.customerId,
      branchId:      input.branchId,
      ncf:           input.ncf,
      ncfType:       input.ncfType,
      issueDate:     now,
      dueDate:       input.dueDate,
      currency:      input.currency ?? 'DOP',
      subtotal:      Math.round((subtotal - discount) * 100) / 100,
      itbis:         Math.round(itbis * 100) / 100,
      totalExempt:   0,
      total:         Math.round((subtotal - discount + itbis) * 100) / 100,
      status:        'issued',
      issuedBy:      input.issuedBy,
      lines,
      createdAt:     now,
    });
  }

  markPaid(): void {
    if (this.props.status === 'cancelled') {
      throw new InvariantViolationError('Cannot mark cancelled invoice as paid');
    }
    this.props.status = 'paid';
  }

  markPartiallyPaid(): void {
    if (this.props.status === 'cancelled') {
      throw new InvariantViolationError('Cannot modify cancelled invoice');
    }
    this.props.status = 'partially_paid';
  }

  cancel(reason: string): void {
    if (this.props.status === 'cancelled' || this.props.status === 'credit_noted') {
      throw new InvariantViolationError(`Invoice already ${this.props.status}`);
    }
    this.props.status = 'cancelled';
    this.props.cancelledAt = new Date();
    this.props.cancelledReason = reason;
  }

  get invoiceId(): string   { return this.props.invoiceId; }
  get ncf(): string         { return this.props.ncf; }
  get ncfType(): NcfType    { return this.props.ncfType; }
  get total(): number       { return this.props.total; }
  get status(): InvoiceStatus { return this.props.status; }
  get customerId(): string  { return this.props.customerId; }

  toSnapshot(): Readonly<InvoiceProps> { return { ...this.props, lines: [...this.props.lines] }; }
}
