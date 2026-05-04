import { createHash, randomUUID } from 'node:crypto';

import { ForbiddenError, NotFoundError } from '@nexo/core-shared-kernel';

import type {
  PasswordHasher,
  RefreshTokenRepository,
  TenantRepository,
  TokenService,
  UserRepository,
} from '../domain/ports.js';

export interface LoginInput {
  email: string;
  password: string;
  tenantSlug: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    userId: string;
    email: string;
    fullName: string;
    mfaRequired: boolean;
  };
  tenant: {
    tenantId: string;
    slug: string;
  };
}

export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly tenants: TenantRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const tenant = await this.tenants.findBySlug(input.tenantSlug);
    if (!tenant || !tenant.isOperational) {
      throw new NotFoundError('Tenant', input.tenantSlug);
    }

    const user = await this.users.findByEmail(input.email);
    if (!user) {
      throw new ForbiddenError('Invalid credentials');
    }

    const valid = await this.hasher.verify(input.password, user.passwordHash);
    if (!valid) {
      user.recordFailedLogin();
      await this.users.save(user);
      throw new ForbiddenError('Invalid credentials');
    }

    user.recordSuccessfulLogin();
    await this.users.save(user);

    const accessToken = await this.tokens.issueAccessToken({
      sub: user.userId,
      tid: tenant.tenantId,
      sch: tenant.schemaName,
    });
    const refreshToken = await this.tokens.issueRefreshToken(user.userId, tenant.tenantId);

    await this.refreshTokens.save({
      tokenId:   randomUUID(),
      userId:    user.userId,
      tenantId:  tenant.tenantId,
      tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
      expiresAt: new Date(Date.now() + this.tokens.refreshTokenTtlMs),
    });

    return {
      accessToken,
      refreshToken,
      user: {
        userId:      user.userId,
        email:       user.email,
        fullName:    user.fullName,
        mfaRequired: user.mfaEnabled,
      },
      tenant: {
        tenantId: tenant.tenantId,
        slug:     tenant.slug,
      },
    };
  }
}
