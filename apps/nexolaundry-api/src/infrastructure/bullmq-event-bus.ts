import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import type { EventBus, DomainEvent } from '@nexo/core-shared-kernel';

type AnyHandler = (event: DomainEvent) => Promise<void>;

const QUEUE_NAME = 'nexo-domain-events';

function makeRedis(url: string) {
  return new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

export class BullMqEventBus implements EventBus {
  private readonly queue:   Queue;
  private readonly worker:  Worker;
  private readonly queueRedis:  IORedis;
  private readonly workerRedis: IORedis;
  private readonly handlers = new Map<string, AnyHandler[]>();

  constructor(redisUrl: string) {
    // BullMQ requiere conexiones Redis separadas para Queue y Worker
    this.queueRedis  = makeRedis(redisUrl);
    this.workerRedis = makeRedis(redisUrl);

    this.queue = new Queue(QUEUE_NAME, {
      connection: this.queueRedis,
      defaultJobOptions: {
        attempts:          3,
        backoff:           { type: 'exponential', delay: 1000 },
        removeOnComplete:  { count: 1000 },
        removeOnFail:      { age: 7 * 24 * 3600 },
      },
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const handlers = this.handlers.get(job.name) ?? [];
        await Promise.all(handlers.map((h) => h(job.data as DomainEvent)));
      },
      { connection: this.workerRedis },
    );

    this.worker.on('failed', (job, err) => {
      console.error(JSON.stringify({
        level: 'error', msg: '[event-bus] job failed',
        jobId: job?.id, event: job?.name, err: String(err),
      }));
    });
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    // Fire-and-forget: la orden ya está confirmada en DB; no bloquear el request HTTP
    this.queue.add(event.eventName, event, { jobId: event.eventId }).catch(err => {
      console.error(JSON.stringify({
        level: 'error', msg: '[event-bus] enqueue failed',
        event: event.eventName, err: String(err),
      }));
    });
  }

  subscribe<T>(eventName: string, handler: (event: DomainEvent<T>) => Promise<void>): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler as AnyHandler);
    this.handlers.set(eventName, list);
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    this.queueRedis.disconnect();
    this.workerRedis.disconnect();
  }
}
