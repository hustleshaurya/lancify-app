export class RateLimitError extends Error {
  constructor(message, retryAfterSeconds) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit({ cache, key, limit = 60, windowSeconds = 60 }) {
  if (!cache || !key) return;
  const bucketKey = `rl:${key}`;
  const now = Date.now();
  const resetAt = now + (windowSeconds * 1000);
  const current = await cache.get(bucketKey);
  const bucket = current && Number(current.resetAt || 0) > now
    ? current
    : { count: 0, resetAt };

  if (Number(bucket.count || 0) >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new RateLimitError('Too many opportunity scans. Please retry shortly.', retryAfterSeconds);
  }

  bucket.count = Number(bucket.count || 0) + 1;
  await cache.set(bucketKey, bucket, windowSeconds);
}
