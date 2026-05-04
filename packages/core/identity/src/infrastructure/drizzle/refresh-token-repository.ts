import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { TenantId, UserId } from '@nexo/core-shared-kernel';

import type { RefreshTokenData, RefreshTokenRepository } from '../../domain/ports.js';
import * as schema from './schema.js';

export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema });
  }

  async save(data: Omit<RefreshTokenData, 'revokedAt'>): Promise<void> {
    await this.db.insert(schema.refreshTokens).values({
      tokenId:   data.tokenId,
      userId:    data.userId,
      tenantId:  data.tenantId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    });
  }

  async findByHash(hash: string): Promise<RefreshTokenData | null> {
    const rows = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, hash))
      .limit(1);
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      tokenId:   row.tokenId,
      userId:    UserId(row.userId),
      tenantId:  TenantId(row.tenantId),
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt ?? undefined,
    };
  }

  async revoke(tokenId: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.refreshTokens.tokenId, tokenId), isNull(schema.refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: UserId, tenantId: TenantId): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.refreshTokens.userId, userId),
          eq(schema.refreshTokens.tenantId, tenantId),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
  }
}
