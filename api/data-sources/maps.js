import { fetchJson } from '../utils/http.js';
import { cleanText, normalizeUrl, stableHash, uniqueBy } from '../utils/text.js';

export async function runApifyMaps({ apiToken, query, cache, logger }) {
  if (!apiToken) {
    logger?.warn?.('apify_token_missing');
    return [];
  }

  const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${encodeURIComponent(apiToken)}&timeout=45`;
  try {
    const data = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: 20,
        language: 'en',
      }),
    }, {
      timeoutMs: 30000,
      retries: 1,
      cache,
      cacheKey: `apify:maps:${stableHash(query)}`,
      cacheTtlSeconds: 1800,
      logger,
    });

    if (!Array.isArray(data)) return [];
    return uniqueBy(data.slice(0, 24).map((item, index) => {
      const website = normalizeUrl(item.website || '');
      const mapsUrl = normalizeUrl(item.url || '');
      return {
        sourceId: `maps:apify:${stableHash(`${item.title}:${item.address}:${index}`)}`,
        name: cleanText(item.title),
        platform: 'Google Maps',
        profileUrl: website || mapsUrl,
        websiteUrl: website,
        description: cleanText(item.categoryName || item.categories?.[0] || 'Local business'),
        location: cleanText(item.address || ''),
        phone: cleanText(item.phone || ''),
        rating: Number(item.totalScore || 0),
        reviews: Number(item.reviewsCount || 0),
        metrics: {
          rating: Number(item.totalScore || 0),
          reviews: Number(item.reviewsCount || 0),
        },
        signals: [
          website ? 'has-website' : null,
          item.phone ? 'has-phone' : null,
          Number(item.reviewsCount || 0) >= 50 ? 'local-demand' : null,
        ].filter(Boolean),
        raw: item,
      };
    }), (profile) => `${profile.name}:${profile.profileUrl}`);
  } catch (error) {
    logger?.warn?.('apify_maps_failed', { query, error });
    return [];
  }
}
