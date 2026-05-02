import { fetchText } from '../utils/http.js';
import {
  cleanText,
  getHost,
  getRootDomain,
  mapLimit,
  normalizeUrl,
  stableHash,
  stripHtml,
} from '../utils/text.js';

const BAD_EMAIL_TOKENS = [
  'example.com',
  'domain.com',
  'email.com',
  'yourname',
  'name@',
  'test@',
  'sentry.io',
  'wixpress.com',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
];

const SOCIAL_PATTERNS = {
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>?#)]+/gi,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?/gi,
  facebook: /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._/-]+/gi,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._-]+\/?/gi,
  youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/|c\/|@)[A-Za-z0-9._-]+\/?/gi,
};

function extractEmails(text) {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map((email) => email.toLowerCase()))]
    .filter((email) => !BAD_EMAIL_TOKENS.some((token) => email.includes(token)))
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .slice(0, 5);
}

function extractSocialLinks(text, profileUrl = '') {
  const socialLinks = {
    linkedin: null,
    instagram: null,
    facebook: null,
    tiktok: null,
    youtube: null,
  };
  const source = `${text || ''} ${profileUrl || ''}`;
  for (const [network, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const links = source.match(pattern) || [];
    if (links.length) socialLinks[network] = normalizeUrl(links[0].replace(/[),.]+$/, ''));
  }
  return socialLinks;
}

function scoreContactAvailability({ emails, socialLinks, phone, website }) {
  let score = 20;
  if (website) score += 15;
  if (phone) score += 15;
  if (emails.length) score += 35;
  if (socialLinks.linkedin) score += 12;
  if (socialLinks.instagram) score += 8;
  if (socialLinks.facebook || socialLinks.tiktok || socialLinks.youtube) score += 6;
  return Math.min(100, score);
}

async function fetchReadablePage(url, { cache, logger }) {
  const normalized = normalizeUrl(url);
  if (!normalized) return '';
  const root = getRootDomain(normalized);
  const directUrls = [
    normalized,
    `${new URL(normalized).origin}/contact`,
    `${new URL(normalized).origin}/about`,
  ];
  const jinaUrl = root ? `https://r.jina.ai/http://${root}` : '';

  const pages = [];
  for (const pageUrl of [...directUrls, jinaUrl].filter(Boolean)) {
    try {
      const text = await fetchText(pageUrl, {}, {
        timeoutMs: 4500,
        retries: 0,
        cache,
        cacheKey: `contact:${stableHash(pageUrl)}`,
        cacheTtlSeconds: 86400,
        logger,
      });
      pages.push(text.slice(0, 120000));
    } catch (error) {
      logger?.warn?.('contact_page_fetch_failed', { pageUrl, error });
    }
  }
  return pages.join('\n');
}

export async function enrichContactsForProfiles({ profiles, cache, logger, maxProfiles = 20 }) {
  const head = (profiles || []).slice(0, maxProfiles);
  const tail = (profiles || []).slice(maxProfiles);
  const enriched = await mapLimit(head, 5, async (profile) => {
    const website = normalizeUrl(profile.websiteUrl || profile.website || (getHost(profile.profileUrl).match(/linkedin|instagram|youtube|tiktok/) ? '' : profile.profileUrl));
    let pageText = '';
    if (website) {
      pageText = await fetchReadablePage(website, { cache, logger });
    }
    const searchable = `${stripHtml(pageText)} ${profile.description || ''} ${profile.profileUrl || ''}`;
    const emails = extractEmails(searchable);
    const socialLinks = extractSocialLinks(searchable, profile.profileUrl);
    const phone = cleanText(profile.phone || '');
    const validation = [
      emails.length ? 'email_found' : 'email_missing',
      Object.values(socialLinks).some(Boolean) ? 'social_found' : 'social_missing',
      phone ? 'phone_found' : 'phone_missing',
      website ? 'website_checked' : 'website_missing',
    ];

    const contactInfo = {
      email: emails[0] || null,
      emails,
      socialLinks,
      phone: phone || null,
      website: website || null,
      availabilityScore: scoreContactAvailability({ emails, socialLinks, phone, website }),
      validation,
    };

    return {
      ...profile,
      contactInfo,
      contactabilityScore: contactInfo.availabilityScore,
    };
  });

  return [
    ...enriched,
    ...tail.map((profile) => ({
      ...profile,
      contactInfo: profile.contactInfo || {
        email: null,
        emails: [],
        socialLinks: extractSocialLinks('', profile.profileUrl),
        phone: cleanText(profile.phone || '') || null,
        website: normalizeUrl(profile.websiteUrl || profile.website || ''),
        availabilityScore: profile.phone ? 35 : 20,
        validation: ['not_checked_over_limit'],
      },
    })),
  ];
}
