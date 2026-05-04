import type { CustomerId } from '@nexo/core-shared-kernel';
import type { Customer } from './customer.js';

export interface CustomerSearchOptions {
  query?: string;
  phone?: string;
  documentNumber?: string;
  limit?: number;
  offset?: number;
}

export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  findByCode(code: string): Promise<Customer | null>;
  findByDocument(type: string, number: string): Promise<Customer | null>;
  search(opts: CustomerSearchOptions): Promise<Customer[]>;
  save(customer: Customer): Promise<void>;
  nextCode(): Promise<string>;
}
