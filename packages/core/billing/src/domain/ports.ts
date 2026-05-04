import type { Invoice, InvoiceStatus, NcfType } from './invoice.js';
import type { NcfSequence } from './ncf-sequence.js';

export interface InvoiceListOptions {
  customerId?: string;
  orderId?: string;
  status?: InvoiceStatus;
  limit?: number;
  offset?: number;
}

export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByNcf(ncf: string): Promise<Invoice | null>;
  list(opts: InvoiceListOptions): Promise<Invoice[]>;
  save(invoice: Invoice): Promise<void>;
  updatePaymentStatus(invoiceId: string, status: InvoiceStatus): Promise<void>;
  nextInvoiceNumber(): Promise<string>;
}

export interface NcfSequenceRepository {
  findActive(ncfType: NcfType, branchId?: string): Promise<NcfSequence | null>;
  save(seq: NcfSequence): Promise<void>;
}
