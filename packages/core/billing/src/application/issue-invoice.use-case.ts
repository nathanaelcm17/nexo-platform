import { randomUUID } from 'node:crypto';

import { NotFoundError, InvariantViolationError } from '@nexo/core-shared-kernel';

import { Invoice, type NcfType } from '../domain/invoice.js';
import type { InvoiceRepository, NcfSequenceRepository } from '../domain/ports.js';

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate: number;
}

export interface IssueInvoiceInput {
  orderId?: string;
  customerId: string;
  branchId: string;
  ncfType: NcfType;
  issuedBy: string;
  currency?: string;
  dueDate?: Date;
  lines: InvoiceLineInput[];
}

export interface IssueInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  ncf: string;
  total: number;
}

export class IssueInvoiceUseCase {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly ncfSequences: NcfSequenceRepository,
  ) {}

  async execute(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    const ncfSeq = await this.ncfSequences.findActive(input.ncfType, input.branchId);
    if (!ncfSeq) {
      throw new NotFoundError('NcfSequence', input.ncfType);
    }

    if (ncfSeq.remaining <= 0) {
      throw new InvariantViolationError(`No NCF numbers available for type ${input.ncfType}`);
    }

    const ncf           = ncfSeq.nextNcf();
    const invoiceNumber = await this.invoices.nextInvoiceNumber();

    const invoice = Invoice.create({
      invoiceId:     randomUUID(),
      invoiceNumber,
      orderId:       input.orderId,
      customerId:    input.customerId,
      branchId:      input.branchId,
      ncf,
      ncfType:       input.ncfType,
      currency:      input.currency,
      issuedBy:      input.issuedBy,
      dueDate:       input.dueDate,
      lines:         input.lines.map(l => ({ lineId: randomUUID(), ...l })),
    });

    // Guardar secuencia (contador avanzado) e invoice en la misma operación lógica
    await this.ncfSequences.save(ncfSeq);
    await this.invoices.save(invoice);

    return {
      invoiceId:     invoice.invoiceId,
      invoiceNumber: invoiceNumber,
      ncf,
      total:         invoice.total,
    };
  }
}
