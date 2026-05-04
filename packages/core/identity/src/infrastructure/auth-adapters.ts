/**
 * Adaptadores de infraestructura del contexto Identity.
 * Implementan los puertos definidos en domain/ports.ts.
 */

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

import type { UserId, TenantId } from '@nexo/core-shared-kernel';

import type { PasswordHasher, TokenService } from '../domain/ports.js';

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    // ADR-011: Argon2id con parámetros 2026
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}

export class JwtTokenService implements TokenService {
  constructor(
    private readonly accessSecret: string,
    private readonly refreshSecret: string,
    private readonly accessTtlSec: number = 900,
    private readonly refreshTtlSec: number = 60 * 60 * 24 * 7,
  ) {}

  async issueAccessToken(claims: Record<string, unknown>): Promise<string> {
    return jwt.sign(claims, this.accessSecret, { expiresIn: this.accessTtlSec });
  }

  async issueRefreshToken(userId: UserId, tenantId: TenantId): Promise<string> {
    const jti = randomUUID();
    return jwt.sign(
      { sub: userId, tid: tenantId, jti },
      this.refreshSecret,
      { expiresIn: this.refreshTtlSec },
    );
  }

  async verifyAccessToken(token: string): Promise<Record<string, unknown>> {
    return jwt.verify(token, this.accessSecret) as Record<string, unknown>;
  }
}
