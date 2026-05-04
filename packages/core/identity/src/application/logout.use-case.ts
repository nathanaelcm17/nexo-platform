import { createHash } from 'node:crypto';

import { ForbiddenError } from '@nexo/core-shared-kernel';

import type { RefreshTokenRepository, TokenService } from '../domain/ports.js';

export interface LogoutInput {
  refreshToken: string;
}

export class LogoutUseCase {
  constructor(
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    await this.tokens.verifyRefreshToken(input.refreshToken);

    const tokenHash = createHash('sha256').update(input.refreshToken).digest('hex');
    const stored = await this.refreshTokens.findByHash(tokenHash);

    if (!stored) throw new ForbiddenError('Refresh token not found');

    await this.refreshTokens.revoke(stored.tokenId);
  }
}
