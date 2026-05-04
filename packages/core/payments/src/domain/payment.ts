import { InvariantViolationError } from '@nexo/core-shared-kernel';

export type PaymentMethod = 'cash' | 'card_manual' | 'transfer' | 'credit';

export interface PaymentProps {
  paymentId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  receivedBy: string;
  receivedAt: Date;
  notes?: string;
}

export class Payment {
  private constructor(private readonly props: PaymentProps) {}

  static rehydrate(props: PaymentProps): Payment {
    return new Payment(props);
  }

  static create(input: {
    paymentId: string;
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    receivedBy: string;
    notes?: string;
  }): Payment {
    if (input.amount <= 0) throw new InvariantViolationError('Payment amount must be positive');
    return new Payment({
      ...input,
      receivedAt: new Date(),
    });
  }

  get paymentId(): string { return this.props.paymentId; }
  get invoiceId(): string { return this.props.invoiceId; }
  get amount(): number    { return this.props.amount; }
  get method(): PaymentMethod { return this.props.method; }

  toSnapshot(): Readonly<PaymentProps> { return { ...this.props }; }
}
