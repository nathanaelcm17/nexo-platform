/**
 * Branded types - IDs tipados para prevenir mezclar identificadores
 * de diferentes entidades en tiempo de compilación.
 *
 * Ejemplo: una función que recibe TenantId no acepta un UserId por error.
 */

declare const brand: unique symbol;

export type Brand<T, B> = T & { readonly [brand]: B };

export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type CustomerId = Brand<string, 'CustomerId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type InvoiceId = Brand<string, 'InvoiceId'>;
export type BranchId = Brand<string, 'BranchId'>;

export const TenantId = (v: string): TenantId => v as TenantId;
export const UserId = (v: string): UserId => v as UserId;
export const CustomerId = (v: string): CustomerId => v as CustomerId;
export const OrderId = (v: string): OrderId => v as OrderId;
export const InvoiceId = (v: string): InvoiceId => v as InvoiceId;
export const BranchId = (v: string): BranchId => v as BranchId;
