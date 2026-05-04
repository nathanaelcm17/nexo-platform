import type { Invoice, NcfType } from './invoice.js';
import type { NcfSequence } from './ncf-sequence.js';

export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByNcf(ncf: string): Promise<Invoice | null>;
  save(invoice: Invoice): Promise<void>;
  nextInvoiceNumber(): Promise<string>;
}

export interface NcfSequenceRepository {
  findActive(ncfType: NcfType, branchId?: string): Promise<NcfSequence | null>;
  save(seq: NcfSequence): Promise<void>;
}
