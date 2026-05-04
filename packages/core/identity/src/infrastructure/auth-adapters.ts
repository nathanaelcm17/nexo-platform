import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

import { ForbiddenError, TenantId, UserId } from '@nexo/core-shared-kernel';

import type { PasswordHasher, TokenService } from '../domain/ports.js';

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
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
  readonly refreshTokenTtlMs: number;

  constructor(
    private readonly accessSecret: string,
    private readonly refreshSecret: string,
    private readonly accessTtlSec: number = 900,
    private readonly refreshTtlSec: number = 60 * 60 * 24 * 7,
  ) {
    this.refreshTokenTtlMs = refreshTtlSec * 1000;
  }

  async issueAccessToken(claims: Record<string, unknown>): Promise<string> {
    return jwt.sign(claims, this.accessSecret, { expiresIn: this.accessTtlSec });
  }

  async issueRefreshToken(userId: UserId, tenantId: TenantId): Promise<string> {
    return jwt.sign(
      { sub: userId, tid: tenantId, jti: randomUUID() },
      this.refreshSecret,
      { expiresIn: this.refreshTtlSec },
    );
  }

  async verifyAccessToken(token: string): Promise<Record<string, unknown>> {
    try {
      return jwt.verify(token, this.accessSecret) as Record<string, unknown>;
    } catch {
      throw new ForbiddenError('Invalid or expired access token');
    }
  }

  async verifyRefreshToken(token: string): Promise<{ sub: UserId; tid: TenantId }> {
    try {
      const payload = jwt.verify(token, this.refreshSecret) as { sub: string; tid: string };
      return { sub: UserId(payload.sub), tid: TenantId(payload.tid) };
    } catch {
      throw new ForbiddenError('Invalid or expired refresh token');
    }
  }
}
