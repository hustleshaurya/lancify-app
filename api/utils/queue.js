import { cleanText } from './text.js';

export async function createLeadQueue(env = process.env, logger = null) {
  const mode = cleanText(env.LEAD_QUEUE_MODE || '').toLowerCase();
  const redisUrl = cleanText(env.REDIS_URL || env.BULLMQ_REDIS_URL || '');

  if (mode === 'bullmq' && redisUrl) {
    try {
      const { Queue } = await import('bullmq');
      const queue = new Queue('opportunity-lead-scans', {
        connection: { url: redisUrl },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      });
      return {
        backend: 'bullmq',
        async enqueue(name, payload) {
          const job = await queue.add(name, payload);
          return { queued: true, jobId: String(job.id), backend: 'bullmq' };
        },
      };
    } catch (error) {
      logger?.warn?.('bullmq_unavailable_using_inline_execution', { error });
    }
  }

  return {
    backend: 'inline',
    async enqueue() {
      return { queued: false, backend: 'inline' };
    },
  };
}
