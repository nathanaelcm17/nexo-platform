import { createHash, randomUUID } from 'node:crypto';

import { ForbiddenError, NotFoundError } from '@nexo/core-shared-kernel';

import type {
  RefreshTokenRepository,
  TenantRepository,
  TokenService,
  UserRepository,
} from '../domain/ports.js';

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
}

export class RefreshTokenUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly tenants: TenantRepository,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: RefreshTokenInput): Promise<RefreshTokenResult> {
    const claims = await this.tokens.verifyRefreshToken(input.refreshToken);

    const tokenHash = createHash('sha256').update(input.refreshToken).digest('hex');
    const stored = await this.refreshTokens.findByHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new ForbiddenError('Refresh token is invalid or has been revoked');
    }

    // Rotación: revocar el token actual antes de emitir uno nuevo
    await this.refreshTokens.revoke(stored.tokenId);

    const user = await this.users.findById(claims.sub);
    if (!user) throw new NotFoundError('User', claims.sub);

    const tenant = await this.tenants.findById(claims.tid);
    if (!tenant || !tenant.isOperational) throw new NotFoundError('Tenant', claims.tid);

    const newAccessToken = await this.tokens.issueAccessToken({
      sub: user.userId,
      tid: tenant.tenantId,
      sch: tenant.schemaName,
    });
    const newRefreshToken = await this.tokens.issueRefreshToken(user.userId, tenant.tenantId);

    await this.refreshTokens.save({
      tokenId:   randomUUID(),
      userId:    user.userId,
      tenantId:  tenant.tenantId,
      tokenHash: createHash('sha256').update(newRefreshToken).digest('hex'),
      expiresAt: new Date(Date.now() + this.tokens.refreshTokenTtlMs),
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}
