import type { CustomerRepository, CustomerSearchOptions } from '../domain/ports.js';
import type { Customer } from '../domain/customer.js';

export class SearchCustomersUseCase {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(opts: CustomerSearchOptions): Promise<Customer[]> {
    return this.customers.search({ ...opts, limit: opts.limit ?? 20 });
  }
}
