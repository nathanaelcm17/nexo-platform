import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
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
      // Drizzle instance escopado al schema del tenant (search_path ya establecido)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db?: NodePgDatabase<any>;
    }
  }
}
