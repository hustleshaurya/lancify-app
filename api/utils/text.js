export const DAY_MS = 24 * 60 * 60 * 1000;

export function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function lower(value) {
  return cleanText(value).toLowerCase();
}

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mapLimit(items, limit, mapper) {
  const input = Array.isArray(items) ? items : [];
  const concurrency = clamp(limit || 4, 1, 20);
  const output = new Array(input.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < input.length) {
      const current = nextIndex;
      nextIndex += 1;
      output[current] = await mapper(input[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, input.length) }, worker));
  return output;
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = cleanText(keyFn(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function stableHash(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash &= 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

export function getHost(url) {
  try {
    return new URL(cleanText(url)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function getRootDomain(urlOrHost) {
  const host = cleanText(urlOrHost).startsWith('http')
    ? getHost(urlOrHost)
    : cleanText(urlOrHost).replace(/^www\./, '').toLowerCase();
  if (!host) return '';
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

export function isValidHttpUrl(url) {
  try {
    const parsed = new URL(cleanText(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeUrl(url) {
  const raw = cleanText(url);
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return isValidHttpUrl(withProtocol) ? withProtocol : '';
}

export function extractLocation(prompt) {
  const text = cleanText(prompt);
  const index = text.toLowerCase().lastIndexOf(' in ');
  if (index === -1) return '';
  return cleanText(text.slice(index + 4));
}

export function daysSince(isoDate) {
  if (!isoDate) return 999;
  const ts = new Date(isoDate).getTime();
  if (!Number.isFinite(ts)) return 999;
  return Math.max(0, Math.floor((Date.now() - ts) / DAY_MS));
}

export function formatCompactNumber(number, suffix) {
  const value = Number(number || 0);
  if (!Number.isFinite(value) || value <= 0) return 'Not listed';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ${suffix}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k ${suffix}`;
  return `${Math.round(value)} ${suffix}`;
}

export function parseUsdNumber(value) {
  const raw = cleanText(value).replace(/,/g, '');
  if (!raw) return null;
  const number = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseUsdRange(rangeText) {
  const nums = cleanText(rangeText).match(/(\d+(?:\.\d+)?)/g) || [];
  if (!nums.length) return { min: 150, max: 450, avg: 300 };
  if (nums.length === 1) {
    const only = Number(nums[0]);
    return { min: only, max: only, avg: only };
  }
  const min = Number(nums[0]);
  const max = Number(nums[1]);
  return { min, max, avg: Math.round((min + max) / 2) };
}

export function normalizeDealValue(raw, fallback = '$150 - $450') {
  const text = cleanText(raw);
  if (!text) return fallback;

  const rangeMatch = text.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:-|to)\s*\$?\s*([\d,]+(?:\.\d+)?)(.*)$/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1].replace(/,/g, ''));
    const max = Number(rangeMatch[2].replace(/,/g, ''));
    const suffix = cleanText(rangeMatch[3] || '');
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min && max <= 100000) {
      return `$${min.toLocaleString('en-US')} - $${max.toLocaleString('en-US')}${suffix ? ` ${suffix}` : ''}`;
    }
  }

  return text.replace(/\s+/g, ' ');
}

export function stripHtml(html) {
  return cleanText(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&'));
}

export function extractJson(raw, fallback) {
  const text = String(raw || '').replace(/```json|```/g, '').trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    const firstArray = text.indexOf('[');
    const lastArray = text.lastIndexOf(']');
    if (firstArray !== -1 && lastArray > firstArray) {
      try {
        return JSON.parse(text.slice(firstArray, lastArray + 1));
      } catch {
        return fallback;
      }
    }

    const firstObject = text.indexOf('{');
    const lastObject = text.lastIndexOf('}');
    if (firstObject !== -1 && lastObject > firstObject) {
      try {
        return JSON.parse(text.slice(firstObject, lastObject + 1));
      } catch {
        return fallback;
      }
    }
  }
  return fallback;
}
