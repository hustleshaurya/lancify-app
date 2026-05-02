import { cleanText, sleep, stableHash } from './text.js';

function buildCacheKey(url, opts) {
  const method = cleanText(opts?.method || 'GET').toUpperCase();
  const body = opts?.body ? stableHash(opts.body) : '';
  return `http:${method}:${stableHash(`${url}:${body}`)}`;
}

function parseRetryAfter(headers) {
  const raw = headers?.get?.('retry-after');
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

export async function fetchText(url, opts = {}, config = {}) {
  const {
    timeoutMs = 12000,
    retries = 1,
    cache = null,
    cacheKey = null,
    cacheTtlSeconds = 0,
    logger = null,
  } = config;
  const key = cacheKey || (cacheTtlSeconds > 0 ? buildCacheKey(url, opts) : null);

  if (cache && key) {
    const cached = await cache.get(key);
    if (cached !== null && cached !== undefined) return String(cached);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...opts, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.status = response.status;
        error.body = text.slice(0, 500);
        error.retryAfterMs = response.status === 429 ? parseRetryAfter(response.headers) : 0;
        throw error;
      }
      if (cache && key && cacheTtlSeconds > 0) {
        await cache.set(key, text, cacheTtlSeconds);
      }
      return text;
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'AbortError' || error?.status === 429 || error?.status >= 500;
      if (!retryable || attempt >= retries) break;
      const backoff = error.retryAfterMs || (350 * (attempt + 1) ** 2);
      logger?.warn?.('retrying_http_request', { url, attempt: attempt + 1, backoff });
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error(`Request failed for ${url}`);
}

export async function fetchJson(url, opts = {}, config = {}) {
  const text = await fetchText(url, opts, config);
  try {
    return JSON.parse(text);
  } catch (error) {
    error.message = `Invalid JSON from ${url}: ${error.message}`;
    throw error;
  }
}
