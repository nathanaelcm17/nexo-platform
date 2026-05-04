import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  // POST /api/v1/auth/login — emite access + refresh token
  router.post('/login', controller.handleLogin);

  // POST /api/v1/auth/refresh — rota el refresh token
  router.post('/refresh', controller.handleRefresh);

  // POST /api/v1/auth/logout — revoca el refresh token
  router.post('/logout', controller.handleLogout);

  return router;
}
