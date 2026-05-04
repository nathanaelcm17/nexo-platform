/**
 * Tenant - Aggregate Root. Representa una lavandería cliente del SaaS.
 */

import type { TenantId } from '@nexo/core-shared-kernel';
import { InvariantViolationError } from '@nexo/core-shared-kernel';

export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
export type TenantPlan = 'starter' | 'business' | 'enterprise';

export interface TenantProps {
  tenantId: TenantId;
  slug: string;
  legalName: string;
  tradeName: string;
  rnc?: string;
  country: string;
  timezone: string;
  currency: string;
  schemaName: string;
  plan: TenantPlan;
  status: TenantStatus;
  trialEndsAt?: Date;
  activatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export class Tenant {
  private constructor(private props: TenantProps) {}

  static rehydrate(props: TenantProps): Tenant { return new Tenant(props); }

  static create(input: {
    tenantId: TenantId;
    slug: string;
    legalName: string;
    tradeName: string;
    rnc?: string;
    plan?: TenantPlan;
  }): Tenant {
    if (!SLUG_RE.test(input.slug)) {
      throw new InvariantViolationError(`Invalid tenant slug: ${input.slug}`);
    }
    const now = new Date();
    return new Tenant({
      ...input,
      country: 'DO',
      timezone: 'America/Santo_Domingo',
      currency: 'DOP',
      schemaName: `tenant_${input.slug.replace(/-/g, '_')}`,
      plan: input.plan ?? 'starter',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });
  }

  activate(): void {
    if (this.props.status === 'cancelled') {
      throw new InvariantViolationError('Cannot activate cancelled tenant');
    }
    this.props.status = 'active';
    this.props.activatedAt = this.props.activatedAt ?? new Date();
    this.props.updatedAt = new Date();
  }

  suspend(): void {
    this.props.status = 'suspended';
    this.props.updatedAt = new Date();
  }

  get tenantId(): TenantId { return this.props.tenantId; }
  get slug(): string { return this.props.slug; }
  get schemaName(): string { return this.props.schemaName; }
  get status(): TenantStatus { return this.props.status; }
  get isOperational(): boolean { return this.props.status === 'trial' || this.props.status === 'active'; }

  toSnapshot(): Readonly<TenantProps> { return { ...this.props }; }
}
