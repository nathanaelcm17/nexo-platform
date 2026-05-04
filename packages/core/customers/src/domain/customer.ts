import { InvariantViolationError } from '@nexo/core-shared-kernel';
import type { CustomerId, TenantId } from '@nexo/core-shared-kernel';

export type CustomerType = 'individual' | 'business';
export type CustomerDocType = 'cedula' | 'rnc' | 'passport';
export type CustomerStatus = 'active' | 'inactive' | 'blocked';

export interface CustomerProps {
  customerId: CustomerId;
  tenantId: TenantId;
  customerCode: string;
  customerType: CustomerType;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  documentType?: CustomerDocType;
  documentNumber?: string;
  phone?: string;
  email?: string;
  creditLimit: number;
  status: CustomerStatus;
  notes?: string;
  extensions: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class Customer {
  private constructor(private props: CustomerProps) {}

  static rehydrate(props: CustomerProps): Customer {
    return new Customer(props);
  }

  static create(input: {
    customerId: CustomerId;
    tenantId: TenantId;
    customerCode: string;
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
  }): Customer {
    if (input.customerType === 'individual' && !input.firstName) {
      throw new InvariantViolationError('Individual customer requires first name');
    }
    if (input.customerType === 'business' && !input.businessName) {
      throw new InvariantViolationError('Business customer requires business name');
    }
    const now = new Date();
    return new Customer({
      ...input,
      creditLimit: input.creditLimit ?? 0,
      status: 'active',
      extensions: input.extensions ?? {},
      createdAt: now,
      updatedAt: now,
    });
  }

  update(input: {
    firstName?: string;
    lastName?: string;
    businessName?: string;
    phone?: string;
    email?: string;
    creditLimit?: number;
    notes?: string;
    extensions?: Record<string, unknown>;
  }): void {
    if (input.firstName !== undefined) this.props.firstName = input.firstName;
    if (input.lastName !== undefined) this.props.lastName = input.lastName;
    if (input.businessName !== undefined) this.props.businessName = input.businessName;
    if (input.phone !== undefined) this.props.phone = input.phone;
    if (input.email !== undefined) this.props.email = input.email;
    if (input.creditLimit !== undefined) this.props.creditLimit = input.creditLimit;
    if (input.notes !== undefined) this.props.notes = input.notes;
    if (input.extensions !== undefined) this.props.extensions = input.extensions;
    this.props.updatedAt = new Date();
  }

  block(): void {
    if (this.props.status === 'blocked') return;
    this.props.status = 'blocked';
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.status = 'active';
    this.props.updatedAt = new Date();
  }

  get customerId(): CustomerId { return this.props.customerId; }
  get customerCode(): string { return this.props.customerCode; }
  get customerType(): CustomerType { return this.props.customerType; }
  get status(): CustomerStatus { return this.props.status; }
  get isActive(): boolean { return this.props.status === 'active'; }

  get displayName(): string {
    return this.props.customerType === 'business'
      ? (this.props.businessName ?? '')
      : `${this.props.firstName ?? ''} ${this.props.lastName ?? ''}`.trim();
  }

  toSnapshot(): Readonly<CustomerProps> { return { ...this.props }; }
}
