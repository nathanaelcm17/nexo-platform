import { randomUUID } from 'node:crypto';

import { CustomerId, TenantId } from '@nexo/core-shared-kernel';
import { InvariantViolationError } from '@nexo/core-shared-kernel';

import { Customer, type CustomerType, type CustomerDocType } from '../domain/customer.js';
import type { CustomerRepository } from '../domain/ports.js';

export interface CreateCustomerInput {
  tenantId: string;
  customerType: CustomerType;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  documentType?: CustomerDocType;
  documentNumber?: string;
  phone?: string;
  email?: string;
  creditLimit?: number;
  notes?: string;
  extensions?: Record<string, unknown>;
}

export interface CreateCustomerResult {
  customerId: string;
  customerCode: string;
}

export class CreateCustomerUseCase {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    if (input.documentType && input.documentNumber) {
      const existing = await this.customers.findByDocument(input.documentType, input.documentNumber);
      if (existing) {
        throw new InvariantViolationError(
          `Customer with document ${input.documentType}:${input.documentNumber} already exists`,
        );
      }
    }

    const customerCode = await this.customers.nextCode();
    const customer = Customer.create({
      customerId: CustomerId(randomUUID()),
      tenantId: TenantId(input.tenantId),
      customerCode,
      customerType: input.customerType,
      firstName: input.firstName,
      lastName: input.lastName,
      businessName: input.businessName,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      phone: input.phone,
      email: input.email,
      creditLimit: input.creditLimit,
      notes: input.notes,
      extensions: input.extensions,
    });

    await this.customers.save(customer);
    return { customerId: customer.customerId, customerCode: customer.customerCode };
  }
}
