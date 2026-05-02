import { fetchJson } from '../utils/http.js';
import { MARKETPLACE_BLOCKLIST } from '../utils/config.js';
import { cleanText, getHost, lower, normalizeUrl, stableHash, uniqueBy } from '../utils/text.js';

function detectPlatform(link, host) {
  const url = lower(link);
  if (host.includes('linkedin.com')) return 'LinkedIn';
  if (host.includes('myshopify.com') || url.includes('/products/')) return 'Shopify';
  if (host.includes('producthunt.com')) return 'Product Hunt';
  if (host.includes('instagram.com')) return 'Instagram';
  if (host.includes('tiktok.com')) return 'TikTok';
  if (host.includes('youtube.com')) return 'YouTube';
  return 'Website';
}

function isAllowedResult(result, { excludeTerms = [], allowDomains = [] }) {
  const link = lower(result.link);
  const title = lower(result.title);
  const snippet = lower(result.snippet);
  const host = getHost(link);
  if (!link || !host || !normalizeUrl(link)) return false;

  const blocklist = [
    ...MARKETPLACE_BLOCKLIST,
    'freelancer.com',
    'youtube.com/watch',
    'facebook.com/groups',
    'how to',
    ...excludeTerms,
  ].map(lower);
  if (blocklist.some((keyword) => link.includes(keyword) || title.includes(keyword) || snippet.includes(keyword))) {
    return false;
  }

  const allow = (allowDomains || []).map(lower).filter(Boolean);
  if (allow.length && !allow.some((domain) => host.includes(domain))) return false;
  return true;
}

export async function runSerpGoogle({
  apiKey,
  query,
  excludeTerms = [],
  allowDomains = [],
  cache,
  logger,
}) {
  if (!apiKey) {
    logger?.warn?.('serpapi_key_missing');
    return [];
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '20');
  url.searchParams.set('api_key', apiKey);

  try {
    const data = await fetchJson(url.toString(), {}, {
      timeoutMs: 11000,
      retries: 2,
      cache,
      cacheKey: `serp:google:${stableHash(query)}`,
      cacheTtlSeconds: 1800,
      logger,
    });

    return uniqueBy((data.organic_results || [])
      .filter((result) => isAllowedResult(result, { excludeTerms, allowDomains }))
      .slice(0, 24)
      .map((result, index) => {
        const link = normalizeUrl(result.link);
        const host = getHost(link);
        return {
          sourceId: `serp:${host}:${stableHash(`${result.title}:${index}`)}`,
          name: cleanText(result.title).replace(/\s*[-|].*$/, ''),
          platform: detectPlatform(link, host),
          profileUrl: link,
          websiteUrl: link,
          description: cleanText(result.snippet).slice(0, 500),
          location: '',
          metrics: {
            position: Number(result.position || index + 1),
          },
          signals: [
            lower(result.snippet).includes('pricing') ? 'pricing-visible' : null,
            lower(result.snippet).includes('book') ? 'booking-intent' : null,
            lower(result.snippet).includes('store') || lower(result.snippet).includes('shop') ? 'monetization' : null,
          ].filter(Boolean),
          raw: result,
        };
      }), (profile) => profile.profileUrl);
  } catch (error) {
    logger?.warn?.('serp_google_failed', { query, error });
    return [];
  }
}

export async function runSerpMaps({ apiKey, query, cache, logger }) {
  if (!apiKey) {
    logger?.warn?.('serpapi_key_missing_for_maps');
    return [];
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_maps');
  url.searchParams.set('type', 'search');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);

  try {
    const data = await fetchJson(url.toString(), {}, {
      timeoutMs: 11000,
      retries: 2,
      cache,
      cacheKey: `serp:maps:${stableHash(query)}`,
      cacheTtlSeconds: 1200,
      logger,
    });

    return uniqueBy((data.local_results || [])
      .slice(0, 24)
      .map((result, index) => {
        const website = normalizeUrl(result.website || '');
        const mapsUrl = normalizeUrl(result.place_id ? `https://www.google.com/maps/place/?q=place_id:${result.place_id}` : '');
        return {
          sourceId: `maps:serp:${stableHash(`${result.title}:${result.address}:${index}`)}`,
          name: cleanText(result.title),
          platform: 'Google Maps',
          profileUrl: website || mapsUrl,
          websiteUrl: website,
          description: cleanText(result.type || result.address || 'Local business'),
          location: cleanText(result.address || ''),
          phone: cleanText(result.phone || ''),
          rating: Number(result.rating || 0),
          reviews: Number(result.reviews || 0),
          metrics: {
            position: Number(result.position || index + 1),
            rating: Number(result.rating || 0),
            reviews: Number(result.reviews || 0),
          },
          signals: [
            website ? 'has-website' : null,
            result.phone ? 'has-phone' : null,
            Number(result.reviews || 0) >= 50 ? 'local-demand' : null,
          ].filter(Boolean),
          raw: result,
        };
      }), (profile) => `${profile.name}:${profile.profileUrl}`);
  } catch (error) {
    logger?.warn?.('serp_maps_failed', { query, error });
    return [];
  }
}
