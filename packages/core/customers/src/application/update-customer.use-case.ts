import { CustomerId, NotFoundError } from '@nexo/core-shared-kernel';

import type { CustomerRepository } from '../domain/ports.js';

export interface UpdateCustomerInput {
  customerId: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  phone?: string;
  email?: string;
  creditLimit?: number;
  notes?: string;
  extensions?: Record<string, unknown>;
}

export class UpdateCustomerUseCase {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(input: UpdateCustomerInput): Promise<void> {
    const customer = await this.customers.findById(CustomerId(input.customerId));
    if (!customer) throw new NotFoundError('Customer', input.customerId);
    customer.update(input);
    await this.customers.save(customer);
  }
}
