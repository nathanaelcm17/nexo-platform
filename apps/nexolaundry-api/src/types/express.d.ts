import type { TenantId, UserId } from '@nexo/core-shared-kernel';

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        tenantId: TenantId;
        slug: string;
        schemaName: string;
      };
      user?: {
        userId: UserId;
        tenantId: TenantId;
        schemaName: string;
      };
    }
  }
}
