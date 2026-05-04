import { randomUUID } from 'node:crypto';

import { Payment, type PaymentMethod } from '../domain/payment.js';
import type { PaymentRepository } from '../domain/ports.js';

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  receivedBy: string;
  notes?: string;
}

export class RecordPaymentUseCase {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(input: RecordPaymentInput): Promise<string> {
    const payment = Payment.create({ paymentId: randomUUID(), ...input });
    await this.payments.save(payment);
    return payment.paymentId;
  }
}
