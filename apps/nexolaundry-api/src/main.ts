import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Pool } from 'pg';
import IORedis from 'ioredis';

import { Platform, type PlatformContext, type Logger } from '@nexo/core-platform-runtime';
import {
  DrizzleUserRepository,
  DrizzleTenantRepository,
  DrizzleRefreshTokenRepository,
  Argon2PasswordHasher,
  JwtTokenService,
  LoginUseCase,
  RefreshTokenUseCase,
  LogoutUseCase,
} from '@nexo/core-identity';
import { laundryVertical } from '@nexo/vertical-laundry';

import { BullMqEventBus } from './infrastructure/bullmq-event-bus.js';
import { errorMiddleware } from './middleware/error.middleware.js';
// Fase 1: importar cuando se monten rutas de negocio
// import { tenantMiddleware } from './middleware/tenant.middleware.js';
// import { authMiddleware } from './middleware/auth.middleware.js';
import { AuthController } from './controllers/auth.controller.js';
import { createAuthRouter } from './routes/auth.router.js';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
const logger: Logger = {
  info:  (msg, meta) => console.log(JSON.stringify({ level: 'info',  msg, ...meta })),
  warn:  (msg, meta) => console.warn(JSON.stringify({ level: 'warn',  msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: 'error', msg, ...meta })),
  debug: (msg, meta) => console.debug(JSON.stringify({ level: 'debug', msg, ...meta })),
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function main() {
  // --- Infraestructura ---
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    min: Number(process.env.DATABASE_POOL_MIN ?? 2),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });

  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // requerido por BullMQ
  });

  const eventBus = new BullMqEventBus({ host: redis.options.host, port: redis.options.port });

  // --- Platform ---
  const ctx: PlatformContext = {
    coreVersion: '0.1.0',
    eventBus,
    logger,
  };

  const platform = new Platform(ctx);
  platform.registerVertical(laundryVertical);
  await platform.bootstrapAll();

  // --- Servicios Identity ---
  const tokenService = new JwtTokenService(
    process.env.JWT_ACCESS_SECRET  ?? 'dev-access-secret-change-in-prod',
    process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-in-prod',
    Number(process.env.JWT_ACCESS_TTL  ?? 900),
    Number(process.env.JWT_REFRESH_TTL ?? 604800),
  );

  const userRepo         = new DrizzleUserRepository(pool);
  const tenantRepo       = new DrizzleTenantRepository(pool);
  const refreshTokenRepo = new DrizzleRefreshTokenRepository(pool);
  const hasher           = new Argon2PasswordHasher();

  const loginUseCase        = new LoginUseCase(userRepo, tenantRepo, hasher, tokenService, refreshTokenRepo);
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepo, tenantRepo, tokenService, refreshTokenRepo);
  const logoutUseCase       = new LogoutUseCase(tokenService, refreshTokenRepo);

  // --- Express ---
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: (process.env.CORS_ORIGINS ?? '').split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Health check (sin autenticación)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', coreVersion: ctx.coreVersion, time: new Date().toISOString() });
  });

  // Auth routes (sin tenant middleware — usan public schema directamente)
  const authController = new AuthController(loginUseCase, refreshTokenUseCase, logoutUseCase);
  app.use('/api/v1/auth', createAuthRouter(authController));

  // Rutas protegidas de negocio (tenant + auth)
  // Fase 1: descomentar y añadir routers por bounded context
  // const tenantMw = tenantMiddleware(pool);
  // const authMw   = authMiddleware(tokenService);
  // app.use('/api/v1', tenantMw, authMw, ordersRouter, catalogRouter, ...);

  // Exportamos para que los tests puedan usarla antes del listen
  app.use(errorMiddleware);

  // --- Arranque ---
  const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(port, () => {
    logger.info(`NexoLaundry API listening on :${port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(async () => {
      await platform.shutdownAll();
      await eventBus.close();
      await pool.end();
      redis.disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'Fatal startup error', err: String(err) }));
  process.exit(1);
});
