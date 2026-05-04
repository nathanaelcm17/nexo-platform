import type { Request, Response, NextFunction } from 'express';
import { UserId, TenantId } from '@nexo/core-shared-kernel';
import { ForbiddenError } from '@nexo/core-shared-kernel';
import type { TokenService } from '@nexo/core-identity';

export function authMiddleware(tokens: TokenService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Bearer token required' });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const claims = await tokens.verifyAccessToken(token);

      req.user = {
        userId:     UserId(String(claims.sub)),
        tenantId:   TenantId(String(claims.tid)),
        schemaName: String(claims.sch),
      };

      next();
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(401).json({ code: 'UNAUTHORIZED', message: err.message });
        return;
      }
      next(err);
    }
  };
}
