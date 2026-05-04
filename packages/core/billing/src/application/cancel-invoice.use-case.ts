import { NotFoundError } from '@nexo/core-shared-kernel';

import type { InvoiceRepository } from '../domain/ports.js';

export class CancelInvoiceUseCase {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: { invoiceId: string; reason: string }): Promise<void> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', input.invoiceId);
    invoice.cancel(input.reason);
    await this.invoices.save(invoice);
  }
}
