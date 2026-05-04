import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { LoginUseCase } from '@nexo/core-identity';
import type { RefreshTokenUseCase } from '@nexo/core-identity';
import type { LogoutUseCase } from '@nexo/core-identity';

const loginSchema = z.object({
  email:      z.string().email(),
  password:   z.string().min(1),
  tenantSlug: z.string().min(1),
});

const tokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshTokenUseCase,
    private readonly logout: LogoutUseCase,
  ) {}

  handleLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues });
        return;
      }
      const result = await this.login.execute(body.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  handleRefresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = tokenSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues });
        return;
      }
      const result = await this.refresh.execute(body.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  handleLogout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = tokenSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ code: 'VALIDATION_ERROR', issues: body.error.issues });
        return;
      }
      await this.logout.execute(body.data);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
