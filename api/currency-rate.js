// api/currency-rate.js
// Live USD exchange rates for Lancify currency preferences.

const CACHE_TTL_MS = 60 * 60 * 1000;
const rateCache = new Map();

function normalizeCode(value, fallback) {
  return String(value || fallback || '').trim().toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const from = normalizeCode(req.query?.from, 'USD');
  const to = normalizeCode(req.query?.to, 'USD');

  if (!from || !to) {
    return res.status(400).json({ error: 'Missing currency code' });
  }

  if (from === to) {
    return res.status(200).json({ rate: 1 });
  }

  const cacheKey = `${from}:${to}`;
  const cached = rateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.status(200).json({ rate: cached.rate });
  }

  try {
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(from)}`);
    if (!response.ok) {
      throw new Error(`Exchange API returned ${response.status}`);
    }

    const data = await response.json();
    const rate = Number(data?.rates?.[to]);
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(404).json({ error: `Rate not found for ${from} to ${to}` });
    }

    rateCache.set(cacheKey, { rate, timestamp: Date.now() });
    return res.status(200).json({ rate });
  } catch (error) {
    console.error('[currency-rate] fetch failed', error);
    return res.status(502).json({ error: 'Failed to fetch exchange rate' });
  }
}
