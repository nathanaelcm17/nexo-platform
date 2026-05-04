import type { Payment } from './payment.js';

export interface PaymentRepository {
  save(payment: Payment): Promise<void>;
  findByInvoiceId(invoiceId: string): Promise<Payment[]>;
  sumByInvoiceId(invoiceId: string): Promise<number>;
}
