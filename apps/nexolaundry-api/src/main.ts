/**
 * NexoLaundry API - Entry point.
 *
 * Esta app es un COMPOSITOR: ensambla núcleo + adapters + vertical.
 * No contiene lógica de negocio. Solo configuración y arranque.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { Platform, type PlatformContext, type Logger } from '@nexo/core-platform-runtime';
import { laundryVertical } from '@nexo/vertical-laundry';

// Logger mínimo (reemplazar por Pino/Winston en dev avanzado)
const logger: Logger = {
  info: (msg, meta) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  warn: (msg, meta) => console.warn(JSON.stringify({ level: 'warn', msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: 'error', msg, ...meta })),
  debug: (msg, meta) => console.debug(JSON.stringify({ level: 'debug', msg, ...meta })),
};

// Event bus stub (reemplazar por BullMQ en Fase 0)
const eventBus = {
  publish: async () => { /* TODO */ },
  subscribe: (eventName: string) => { logger.info(`[bus] subscribed ${eventName}`); },
};

async function main() {
  const ctx: PlatformContext = {
    coreVersion: '0.1.0',
    eventBus: eventBus as never,
    logger,
  };

  const platform = new Platform(ctx);

  // Registrar verticales
  platform.registerVertical(laundryVertical);
  await platform.bootstrapAll();

  // Express app
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: (process.env.CORS_ORIGINS ?? '').split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', coreVersion: ctx.coreVersion, time: new Date().toISOString() });
  });

  // TODO: montar routers de cada bounded context
  // app.use('/api/v1/auth', authRouter);
  // app.use('/api/v1/orders', ordersRouter);

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    logger.info(`NexoLaundry API listening on :${port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    await platform.shutdownAll();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { err: String(err) });
  process.exit(1);
});
