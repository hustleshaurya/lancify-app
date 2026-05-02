import { cleanText } from './text.js';

const memoryCache = globalThis.__LANCIFY_OPPORTUNITY_CACHE__ || new Map();
globalThis.__LANCIFY_OPPORTUNITY_CACHE__ = memoryCache;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function upstashCommand(env, command, logger) {
  const url = cleanText(env.UPSTASH_REDIS_REST_URL);
  const token = cleanText(env.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) throw new Error('Upstash REST env not configured');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger?.warn?.('upstash_command_failed', { status: response.status, command: command[0] });
    throw new Error(payload?.error || `Upstash ${response.status}`);
  }
  return payload?.result;
}

export function createCache(env = process.env, logger = null) {
  const hasUpstash = cleanText(env.UPSTASH_REDIS_REST_URL) && cleanText(env.UPSTASH_REDIS_REST_TOKEN);

  return {
    backend: hasUpstash ? 'upstash-redis' : 'memory',

    async get(key) {
      const safeKey = cleanText(key);
      if (!safeKey) return null;
      if (hasUpstash) {
        try {
          const value = await upstashCommand(env, ['GET', safeKey], logger);
          if (value === null || value === undefined) return null;
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        } catch (error) {
          logger?.warn?.('cache_get_fallback_to_memory', { key: safeKey, error });
        }
      }

      const hit = memoryCache.get(safeKey);
      if (!hit) return null;
      if (hit.expiresAt && hit.expiresAt <= nowSeconds()) {
        memoryCache.delete(safeKey);
        return null;
      }
      return hit.value;
    },

    async set(key, value, ttlSeconds = 300) {
      const safeKey = cleanText(key);
      if (!safeKey) return;
      const ttl = Math.max(1, Number(ttlSeconds || 300));
      if (hasUpstash) {
        try {
          await upstashCommand(env, ['SET', safeKey, JSON.stringify(value), 'EX', ttl], logger);
          return;
        } catch (error) {
          logger?.warn?.('cache_set_fallback_to_memory', { key: safeKey, error });
        }
      }
      memoryCache.set(safeKey, { value, expiresAt: nowSeconds() + ttl });
    },

    async del(key) {
      const safeKey = cleanText(key);
      if (!safeKey) return;
      memoryCache.delete(safeKey);
      if (hasUpstash) {
        try {
          await upstashCommand(env, ['DEL', safeKey], logger);
        } catch (error) {
          logger?.warn?.('cache_del_failed', { key: safeKey, error });
        }
      }
    },
  };
}
