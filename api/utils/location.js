import { cleanText, lower } from './text.js';

const COUNTRY_ALIASES = {
  usa: 'united states',
  us: 'united states',
  uae: 'united arab emirates',
  uk: 'united kingdom',
  england: 'united kingdom',
};

function normalizeToken(value) {
  const token = lower(value)
    .replace(/[^a-z0-9\s,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return COUNTRY_ALIASES[token] || token;
}

export function normalizeLocation(input = '') {
  const raw = cleanText(input);
  if (!raw) {
    return {
      raw: '',
      normalized: '',
      city: '',
      region: '',
      country: '',
      tokens: [],
    };
  }

  const parts = raw.split(',').map(normalizeToken).filter(Boolean);
  const normalized = normalizeToken(raw);
  const tokens = [...new Set([
    ...normalized.split(/[\s,]+/).filter((token) => token.length > 2),
    ...parts,
  ])];

  return {
    raw,
    normalized,
    city: parts[0] || normalized,
    region: parts.length > 2 ? parts[1] : '',
    country: parts.length > 1 ? parts[parts.length - 1] : '',
    tokens,
  };
}

function getProfileLocationText(profile) {
  return normalizeToken([
    profile.location,
    profile.raw?.address,
    profile.raw?.city,
    profile.raw?.state,
    profile.raw?.country,
    profile.description,
    profile.profileUrl,
  ].filter(Boolean).join(' '));
}

function getLocationMatchScore(profile, target) {
  if (!target?.normalized) return 0;
  const text = getProfileLocationText(profile);
  if (!text) return 0;

  let score = 0;
  if (target.city && text.includes(target.city)) score += 0.55;
  if (target.region && text.includes(target.region)) score += 0.20;
  if (target.country && text.includes(target.country)) score += 0.35;
  if (target.normalized && text.includes(target.normalized)) score += 0.70;

  const tokenHits = target.tokens.filter((token) => text.includes(token)).length;
  if (target.tokens.length) score += Math.min(0.35, tokenHits / target.tokens.length * 0.35);

  return Math.min(1, score);
}

export function filterByLocation(profiles = [], targetLocation = '', options = {}) {
  const target = normalizeLocation(targetLocation);
  if (!target.normalized) {
    return profiles.map((profile) => ({
      ...profile,
      normalizedLocation: normalizeLocation(profile.location || profile.raw?.address || ''),
      locationMatchScore: 0,
      locationBoost: 1,
    }));
  }

  const minMatches = Number(options.minMatches || 3);
  const annotated = profiles.map((profile) => {
    const matchScore = getLocationMatchScore(profile, target);
    const locationBoost = matchScore >= 0.75 ? 1.20 : matchScore >= 0.45 ? 1.14 : matchScore > 0 ? 1.08 : 0.96;
    return {
      ...profile,
      normalizedLocation: normalizeLocation(profile.location || profile.raw?.address || ''),
      targetLocation: target,
      locationMatchScore: matchScore,
      locationBoost,
    };
  });

  const matched = annotated.filter((profile) => Number(profile.locationMatchScore || 0) > 0);
  const pool = matched.length >= minMatches ? matched : annotated;
  return pool.sort((a, b) => Number(b.locationBoost || 1) - Number(a.locationBoost || 1));
}
