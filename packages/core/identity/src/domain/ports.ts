/**
 * Puertos del contexto Identity.
 * Los adaptadores (infrastructure) implementan estas interfaces.
 */

import type { UserId, TenantId } from '@nexo/core-shared-kernel';
import type { User } from './user.js';
import type { Tenant } from './tenant.js';

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export interface TenantRepository {
  findById(id: TenantId): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<void>;
  provisionSchema(schemaName: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenService {
  issueAccessToken(claims: Record<string, unknown>): Promise<string>;
  issueRefreshToken(userId: UserId, tenantId: TenantId): Promise<string>;
  verifyAccessToken(token: string): Promise<Record<string, unknown>>;
}
