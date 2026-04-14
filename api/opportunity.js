// api/opportunity.js
// Opportunity Engine v2
// Goal: high-intent leads only (especially small creators for creator skills)

const DAY_MS = 24 * 60 * 60 * 1000;

const MARKETPLACE_BLOCKLIST = [
  'fiverr', 'upwork', 'freelancer', 'guru', 'toptal', '99designs',
  'canva', 'veed', 'template', 'theme', 'tool', 'software', 'platform',
  'list', 'top 10', 'best ', 'reddit', 'quora', 'agency'
];

const PRICE_HINTS = {
  'Thumbnail Design': '$120 - $350',
  'Video Editing': '$180 - $600',
  'Voice Over': '$100 - $300',
  'Social Media Management': '$250 - $700',
  'Web Design': '$350 - $1200',
  'Copywriting': '$120 - $400',
  'Email Marketing': '$200 - $700',
  'SEO': '$250 - $900',
  'Funnel Building': '$350 - $1200',
  'Graphic Design': '$120 - $400',
  'Paid Ads': '$300 - $1000',
  'Content Writing': '$100 - $350',
  default: '$150 - $450',
};

const PLAN_CONFIG = {
  free: {
    maxLeadCount: 8,
    maxCandidates: 16,
    baseQuickCredits: 1,
    baseDeepCredits: 3,
    perLeadCredits: 1,
    aiMultiplier: 1.1,
  },
  pro: {
    maxLeadCount: 20,
    maxCandidates: 30,
    baseQuickCredits: 1,
    baseDeepCredits: 2,
    perLeadCredits: 0.65,
    aiMultiplier: 1.0,
  },
};

function parseUsdNumber(v) {
  const raw = String(v ?? '').replace(/,/g, '').trim();
  if (!raw) return null;
  const num = Number(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function parseUsdRange(rangeText) {
  const s = String(rangeText || '');
  const nums = s.match(/(\d+(?:\.\d+)?)/g) || [];
  if (!nums.length) return { min: 150, max: 450, avg: 300 };
  if (nums.length === 1) {
    const n = Number(nums[0]);
    return { min: n, max: n, avg: n };
  }
  const min = Number(nums[0]);
  const max = Number(nums[1]);
  const avg = Math.round((min + max) / 2);
  return { min, max, avg };
}

function resolvePlanTier(body = {}) {
  const raw = lower(body.plan || body.planTier || body.subscription || body.userPlan || 'free');
  if (raw.includes('pro') || raw.includes('plus') || raw.includes('go') || raw.includes('premium')) return 'pro';
  return 'free';
}

function computeLeadTarget({ incomeGoal, skill, planTier }) {
  const plan = PLAN_CONFIG[planTier] || PLAN_CONFIG.free;
  const parsedIncome = parseUsdNumber(incomeGoal);
  const incomeGoalUsd = clamp(Math.round(parsedIncome || 500), 100, 10000);
  const deal = parseUsdRange(PRICE_HINTS[skill] || PRICE_HINTS.default);
  const avgDealUsd = Math.max(80, Number(deal.avg || 300));

  const desiredClients = Math.ceil(incomeGoalUsd / avgDealUsd);
  const requestedLeadCount = clamp(Math.max(3, desiredClients + 1), 3, plan.maxLeadCount);

  return {
    incomeGoalUsd,
    avgDealUsd,
    requestedLeadCount,
    minLeadCount: 3,
    planMaxLeadCount: plan.maxLeadCount,
    planMaxCandidates: plan.maxCandidates,
  };
}

function estimateScanCredits({ isQuickMode, leadCount, planTier, usedAi }) {
  const plan = PLAN_CONFIG[planTier] || PLAN_CONFIG.free;
  const base = isQuickMode ? plan.baseQuickCredits : plan.baseDeepCredits;
  const raw = base + (Number(leadCount || 0) * plan.perLeadCredits);
  const withAi = usedAi ? raw * plan.aiMultiplier : raw;
  return Math.max(1, Math.ceil(withAi));
}

function buildOutreachAssets(lead, skill) {
  const name = cleanText(lead?.name || 'there');
  const problem = cleanText(lead?.problem || `I found a clear ${skill || 'growth'} gap`);
  const strategy = cleanText(lead?.strategy || 'I can share a quick fix plan and implement fast.');
  const deal = cleanText(lead?.dealValue || PRICE_HINTS[skill] || PRICE_HINTS.default);
  const profileUrl = cleanText(lead?.profileUrl || '');

  const quickDm = [
    `Hey ${name},`,
    `I noticed one thing: ${problem}`,
    `I help with ${skill || 'this exact issue'} and can send a quick 2-step fix today.`,
    `If useful, I can do a small starter sprint (${deal}) so you can test risk-free.`,
  ].join('\n');

  const loomScript = [
    `Hi ${name}, quick teardown for your ${lead?.platform || 'business'}.`,
    `1) What I noticed: ${problem}`,
    `2) Why it matters now: ${cleanText(lead?.whyNow || 'you are active and this affects current growth')}`,
    `3) What I would do first: ${strategy}`,
    `4) Simple next step: I can deliver one starter asset this week (${deal}).`,
  ].join('\n');

  const audit = [
    `Lead: ${name}`,
    `URL: ${profileUrl || 'N/A'}`,
    `Skill: ${skill || 'General'}`,
    `Main gap: ${problem}`,
    `First fix: ${strategy}`,
    `Offer range: ${deal}`,
    `Reply angle: ${cleanText(lead?.closingHint || 'Offer a tiny first deliverable')}`,
  ].join('\n');

  const proposal = [
    `Subject: Quick ${skill || 'Growth'} Improvement Plan for ${name}`,
    ``,
    `Hi ${name},`,
    `I reviewed your current setup and found: ${problem}`,
    `My plan: ${strategy}`,
    ``,
    `Deliverables (starter):`,
    `- 1 focused implementation sprint`,
    `- clear before/after comparison`,
    `- feedback iteration`,
    ``,
    `Investment: ${deal}`,
    `If you want, I can start with a small first deliverable this week.`,
  ].join('\n');

  return { quickDm, loomScript, audit, proposal };
}

function attachOutreachAssets(leads, skill) {
  return (leads || []).map((lead) => {
    const assets = buildOutreachAssets(lead, skill);
    return {
      ...lead,
      assets,
      quickDm: assets.quickDm,
      loomScript: assets.loomScript,
      audit: assets.audit,
      proposal: assets.proposal,
    };
  });
}

const SKILL_INTENT_RULES = {
  'Thumbnail Design': {
    requiredAny: ['thumbnail', 'ctr', 'click-through', 'packaging', 'title'],
    forbiddenAny: ['content calendar', 'retention strategy', 'bookkeeping', 'tax'],
    niche: 'creator-visuals',
  },
  'Video Editing': {
    requiredAny: ['editing', 'hook', 'retention', 'shorts', 'video'],
    forbiddenAny: ['bookkeeping', 'tax filing', 'seo audit only'],
    niche: 'creator-video',
  },
  'Voice Over': {
    requiredAny: ['voice', 'narration', 'script read', 'audio'],
    forbiddenAny: ['thumbnail', 'tax filing', 'shopify design'],
    niche: 'creator-audio',
  },
  'Social Media Management': {
    requiredAny: ['social', 'posting', 'content', 'reels', 'engagement'],
    forbiddenAny: ['tax filing', 'bookkeeping', 'server migration'],
    niche: 'local-social',
  },
  'Web Design': {
    requiredAny: ['website', 'landing page', 'conversion', 'cta', 'design'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'local-web',
  },
  'Copywriting': {
    requiredAny: ['copy', 'product description', 'ad copy', 'landing page'],
    forbiddenAny: ['bookkeeping', 'tax filing'],
    niche: 'ecom-copy',
  },
  'Email Marketing': {
    requiredAny: ['email', 'sequence', 'list', 'campaign', 'newsletter'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'coach-email',
  },
  'SEO': {
    requiredAny: ['seo', 'search', 'organic', 'ranking', 'traffic'],
    forbiddenAny: ['bookkeeping', 'tax filing'],
    niche: 'saas-seo',
  },
  'Funnel Building': {
    requiredAny: ['funnel', 'lead', 'booking', 'conversion', 'pipeline'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'coach-funnel',
  },
  'Graphic Design': {
    requiredAny: ['design', 'creative', 'brand visuals', 'product creative'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'ecom-design',
  },
  'Paid Ads': {
    requiredAny: ['ads', 'roas', 'campaign', 'conversion', 'meta ads'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'ecom-ads',
  },
  'Content Writing': {
    requiredAny: ['content', 'blog', 'article', 'case study', 'newsletter'],
    forbiddenAny: ['bookkeeping', 'tax filing'],
    niche: 'saas-content',
  },
};

const GENERIC_PHRASES = [
  'improve online presence',
  'attract more clients',
  'grow business',
  'reach a wider audience',
  'help them succeed',
  'enhance visibility',
];

const SKILL_CONFIG = {
  'Thumbnail Design': {
    method: 'youtube',
    targetType: 'creator',
    ytQueries: [
      'finance youtube channel',
      'productivity youtube channel',
      'education youtube channel',
      'faceless youtube channel',
      'gaming youtube channel',
    ],
    minSubs: 3000,
    maxSubs: 50000,
    maxInactiveDays: 90,
    minAvgViews: 180,
    minViewSubRatio: 0.007,
    searchOrder: 'relevance',
    publishedAfterDays: 180,
    minLeadCount: 3,
    allowWebFallback: false,
  },
  'Video Editing': {
    method: 'youtube',
    targetType: 'creator',
    ytQueries: [
      'small youtube channel vlog',
      'small youtube channel podcast',
      'education youtube creator',
      'faceless youtube channel',
      'gaming youtube channel',
    ],
    minSubs: 1200,
    maxSubs: 90000,
    maxInactiveDays: 120,
    minAvgViews: 120,
    minViewSubRatio: 0.004,
    searchOrder: 'relevance',
    publishedAfterDays: 240,
    minLeadCount: 3,
    allowWebFallback: false,
  },
  'Voice Over': {
    method: 'youtube',
    targetType: 'creator',
    ytQueries: [
      'explainer youtube channel',
      'history youtube channel',
      'education youtube channel',
      'documentary youtube channel',
    ],
    minSubs: 2000,
    maxSubs: 70000,
    allowWebFallback: false,
  },
  'Social Media Management': {
    method: 'maps',
    targetType: 'business',
    apifyMaps: 'restaurant cafe salon gym fitness studio',
    serpQuery: 'restaurant cafe salon gym fitness studio local business',
    exclude: ['agency', 'management company', 'marketing firm'],
  },
  'Web Design': {
    method: 'maps',
    targetType: 'business',
    apifyMaps: 'local business clinic dentist lawyer accountant',
    serpQuery: 'local business clinic dentist lawyer accountant',
    exclude: ['agency', 'web design company', 'wix', 'squarespace', 'template'],
    quickSkipSiteSignals: true,
  },
  'Copywriting': {
    method: 'serp',
    targetType: 'business',
    serpQuery: 'site:myshopify.com clothing OR beauty OR fitness OR supplements store',
    allowDomains: ['myshopify.com'],
    exclude: ['fiverr', 'upwork', 'blog', 'list', 'top 10', 'agency', 'template', 'theme'],
  },
  'Email Marketing': {
    method: 'serp',
    targetType: 'business',
    serpQuery: 'site:linkedin.com/in life coach OR business coach OR fitness coach -recruiter -hiring',
    allowDomains: ['linkedin.com'],
    exclude: ['fiverr', 'upwork', 'mailchimp', 'klaviyo', 'agency', 'tool', 'platform'],
  },
  'SEO': {
    method: 'serp',
    targetType: 'business',
    serpQuery: '(small business website OR local business website OR ecommerce store) (slow website OR weak SEO OR not ranking OR low traffic) -agency -\"seo services\"',
    allowDomains: [],
    exclude: ['agency', 'seo agency', 'digital marketing agency', 'fiverr', 'upwork', 'list', 'top 10', 'semrush', 'ahrefs', 'producthunt.com', 'linkedin.com'],
  },
  'Funnel Building': {
    method: 'serp',
    targetType: 'business',
    serpQuery: 'site:linkedin.com/in life coach OR business coach OR fitness coach OR wellness coach -recruiter -hiring',
    allowDomains: ['linkedin.com'],
    exclude: ['clickfunnels', 'agency', 'tool', 'platform', 'software'],
  },
  'Graphic Design': {
    method: 'serp',
    targetType: 'business',
    serpQuery: 'site:myshopify.com clothing OR accessories OR beauty brand store',
    allowDomains: ['myshopify.com'],
    exclude: ['canva', 'fiverr', 'upwork', 'agency', 'template', 'tool'],
  },
  'Paid Ads': {
    method: 'serp',
    targetType: 'business',
    serpQuery: 'site:myshopify.com ecommerce store fashion OR beauty OR fitness',
    allowDomains: ['myshopify.com'],
    exclude: ['agency', 'facebook', 'google ads', 'tool', 'platform'],
  },
  'Content Writing': {
    method: 'serp',
    targetType: 'business',
    serpQuery: '(saas website OR startup website OR ecommerce brand) (blog OR resources OR knowledge base) -\"content writing services\" -agency',
    allowDomains: [],
    exclude: ['fiverr', 'upwork', 'agency', 'copywriting agency', 'content writing services', 'jasper', 'copy.ai', 'list', 'top 10', 'producthunt.com'],
  },
};

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function cleanText(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function lower(v) {
  return cleanText(v).toLowerCase();
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  return [v];
}

function normalizeSignalTokens(signals = []) {
  const out = new Set();
  for (const raw of asArray(signals)) {
    const s = lower(raw);
    if (!s) continue;
    if (s.includes('inconsistent posting') || s.includes('active posting') || s.includes('active-posting')) {
      out.add('active-posting');
    }
    if (s.includes('low ctr') || s.includes('low views') || s.includes('poor visual quality') || s.includes('high engagement')) {
      out.add('high-engagement');
    }
    if (
      s.includes('no clear cta') ||
      s.includes('no email list') ||
      s.includes('funnel') ||
      s.includes('ad spend') ||
      s.includes('high intent') ||
      s.includes('high-intent')
    ) {
      out.add('high-intent');
    }
    if (s.includes('active-posting') || s.includes('high-engagement') || s.includes('high-intent')) {
      out.add(s);
    }
  }
  return [...out];
}

function normalizeBudgetTokens(budget = []) {
  const out = new Set();
  for (const raw of asArray(budget)) {
    const b = lower(raw);
    if (!b) continue;
    if (b.includes('running paid ads') || b.includes('ad spend') || b.includes('mid-ticket')) out.add('mid-ticket');
    if (b.includes('monetised audience') || b.includes('monetized audience') || b.includes('high-ticket')) out.add('mid-ticket');
    if (b.includes('low-ticket')) out.add('low-ticket');
    if (b.includes('mid-ticket')) out.add('mid-ticket');
  }
  return [...out];
}

function normalizeAudienceBucket(v) {
  const s = lower(v || 'all');
  if (!s || s === 'all') return 'all';
  if (s.includes('growing') || s.includes('10k-50') || s.includes('10k to 50')) return 'growing';
  if (s.includes('beginner') || s.includes('<10') || s.includes('under 10')) return 'beginner';
  if (s.includes('established') || s.includes('50k+')) return 'established';
  return 'all';
}

function normalizeServiceTag(v) {
  const s = lower(v);
  if (!s || s === 'all') return 'all';
  if (s.includes('thumb')) return 'thumbnails';
  if (s.includes('copy')) return 'copywriting';
  if (s.includes('funnel')) return 'funnel';
  if (s.includes('social')) return 'social-media';
  if (s.includes('email')) return 'email';
  return s.replace(/\s+/g, '-');
}

function normalizeAdvancedControls(body = {}) {
  const audienceRaw =
    body.audienceSize ?? body.audience ?? body.audienceFilter ?? body.audienceBucket ?? body.audienceTier ?? 'all';
  const serviceRaw =
    body.serviceMatch ?? body.serviceNeed ?? body.service ?? body.services ?? body.serviceFilter ?? 'all';
  const filtersRaw = body.filters ?? body.filterBy ?? body.filter ?? [];
  const hotRaw = body.hotLeadsOnly ?? body.quickMode ?? body.quick_mode ?? body.hotOnly ?? false;

  const serviceFilters = asArray(serviceRaw)
    .map(normalizeServiceTag)
    .filter((x) => x && x !== 'all');

  const filterSet = new Set(asArray(filtersRaw).map((f) => lower(f)));
  const hotLeadsOnly = hotRaw === true || lower(hotRaw).includes('hot');

  return {
    audienceBucket: normalizeAudienceBucket(audienceRaw),
    serviceFilters,
    hotLeadsOnly,
    filterHighPain: [...filterSet].some((f) => f.includes('high pain') || f.includes('pain>90') || f.includes('pain >90')),
    filterActive7d: [...filterSet].some((f) => f.includes('active') && f.includes('7')),
    filterNoMonetization: [...filterSet].some((f) => f.includes('no monetization')),
  };
}

function formatSubs(subs) {
  if (!Number.isFinite(subs) || subs <= 0) return 'Not listed';
  if (subs >= 1_000_000) return `${(subs / 1_000_000).toFixed(1)}M subscribers`;
  return `${(subs / 1_000).toFixed(1)}k subscribers`;
}

function daysSince(isoDate) {
  if (!isoDate) return 999;
  const ts = new Date(isoDate).getTime();
  if (!Number.isFinite(ts)) return 999;
  return Math.floor((Date.now() - ts) / DAY_MS);
}

function getHost(link) {
  try {
    return new URL(link).host.toLowerCase();
  } catch {
    return '';
  }
}

function getRootDomain(link) {
  const host = getHost(link).replace(/^www\./, '');
  if (!host) return '';
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

function extractLocation(prompt) {
  const t = cleanText(prompt);
  const idx = t.toLowerCase().lastIndexOf(' in ');
  if (idx === -1) return '';
  return cleanText(t.slice(idx + 4));
}

function isBadMarketplaceName(name) {
  const n = lower(name);
  return MARKETPLACE_BLOCKLIST.some((k) => n.includes(k));
}

function dedupeProfiles(items) {
  const seen = new Set();
  const out = [];
  for (const p of items || []) {
    const key = p.sourceId || p.profileUrl || `${lower(p.name)}|${lower(p.platform)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function scoreByChannel(profile, cfg) {
  if ((cfg?.targetType === 'creator') || profile.platform === 'YouTube') {
    return scoreCreatorProfile(profile, cfg);
  }
  if (profile.platform === 'Google Maps') {
    return scoreMapsProfile(profile);
  }
  return scoreSerpProfile(profile, cfg);
}

function scoreCreatorProfile(p, cfg) {
  const subs = Number(p.subscriberCount || 0);
  const ratio = Number(p.viewSubRatio || 0);
  const lastUploadDays = Number(p.lastUploadDays || 999);
  const avgViews = Number(p.avgRecentViews || 0);

  const sizeFit = subs >= (cfg?.minSubs || 0) && subs <= (cfg?.maxSubs || 1000000) ? 100
    : subs < (cfg?.minSubs || 0) ? 30 : 20;
  const activity = lastUploadDays <= 14 ? 100
    : lastUploadDays <= 30 ? 80
    : lastUploadDays <= 45 ? 60
    : lastUploadDays <= 60 ? 40 : 15;
  const engagement = ratio >= 0.12 ? 100
    : ratio >= 0.07 ? 82
    : ratio >= 0.04 ? 65
    : ratio >= 0.02 ? 48 : 20;
  const intent = avgViews >= 5000 ? 90
    : avgViews >= 1500 ? 72
    : avgViews >= 700 ? 56
    : avgViews >= 250 ? 40 : 15;
  const contactability = p.profileUrl ? 70 : 20;
  const offerFit = subs <= 50000 ? 85 : 55;

  const score = (0.24 * intent)
    + (0.22 * activity)
    + (0.20 * engagement)
    + (0.16 * sizeFit)
    + (0.10 * contactability)
    + (0.08 * offerFit);

  p.scoreBreakdown = {
    channel: 'creator',
    intent: Math.round(intent),
    activity: Math.round(activity),
    engagement: Math.round(engagement),
    sizeFit: Math.round(sizeFit),
    contactability: Math.round(contactability),
    offerFit: Math.round(offerFit),
  };

  return clamp(Math.round(score), 55, 99);
}

function scoreMapsProfile(p) {
  const reviews = Number(p.reviews || 0);
  const rating = Number(p.rating || 0);
  const trust = rating >= 4.6 ? 95 : rating >= 4.2 ? 80 : rating >= 3.8 ? 65 : 40;
  const demand = reviews >= 200 ? 95 : reviews >= 70 ? 80 : reviews >= 20 ? 62 : 35;
  const contactability = p.website || p.phone ? 92 : p.profileUrl ? 60 : 20;
  const siteSignalPenalty = p.siteSignal
    ? (!p.siteSignal.hasBooking ? 8 : 0) + (!p.siteSignal.hasSocialProof ? 8 : 0)
    : 0;
  const intent = clamp((p.description ? 68 : 35) + siteSignalPenalty, 35, 95);
  const sizeFit = 75;
  const offerFit = 72;

  const score = (0.24 * intent)
    + (0.22 * trust)
    + (0.20 * demand)
    + (0.14 * contactability)
    + (0.10 * sizeFit)
    + (0.10 * offerFit);

  p.scoreBreakdown = {
    channel: 'maps',
    intent: Math.round(intent),
    trust: Math.round(trust),
    demand: Math.round(demand),
    contactability: Math.round(contactability),
    sizeFit: Math.round(sizeFit),
    offerFit: Math.round(offerFit),
  };

  return clamp(Math.round(score), 55, 97);
}

function scoreSerpProfile(p, cfg) {
  const host = getHost(p.profileUrl);
  const description = lower(p.description);
  const name = lower(p.name);
  const trustedDomain = (cfg?.allowDomains || []).some((d) => host.includes(d));
  const intentSignals = ['store', 'shop', 'coach', 'saas', 'startup', 'book', 'buy', 'pricing', 'services'];
  const intentHits = intentSignals.filter((k) => description.includes(k) || name.includes(k)).length;
  const siteSignalPenalty = p.siteSignal
    ? (!p.siteSignal.hasBooking ? 10 : 0) + (!p.siteSignal.hasPricing ? 8 : 0) + (!p.siteSignal.hasSocialProof ? 7 : 0)
    : 0;
  const intent = clamp(40 + (intentHits * 12) + siteSignalPenalty, 35, 95);
  const contactability = p.profileUrl ? 70 : 20;
  const domainQuality = trustedDomain ? 92 : 58;
  const sizeFit = 72;
  const offerFit = trustedDomain ? 84 : 65;
  const freshness = 70;

  const score = (0.24 * intent)
    + (0.21 * domainQuality)
    + (0.18 * offerFit)
    + (0.15 * contactability)
    + (0.12 * sizeFit)
    + (0.10 * freshness);

  p.scoreBreakdown = {
    channel: 'serp',
    intent: Math.round(intent),
    domainQuality: Math.round(domainQuality),
    offerFit: Math.round(offerFit),
    contactability: Math.round(contactability),
    sizeFit: Math.round(sizeFit),
    freshness: Math.round(freshness),
  };

  return clamp(Math.round(score), 55, 96);
}

async function fetchJson(url, opts = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchYouTubeCreators({
  YOUTUBE,
  queries,
  location,
  minSubs,
  maxSubs,
  maxInactiveDays = 60,
  minAvgViews = 250,
  minViewSubRatio = 0.01,
  searchOrder = 'date',
  publishedAfterDays = 90,
}) {
  if (!YOUTUBE) return [];

  const safeMaxInactiveDays = Number(maxInactiveDays || 60);
  const safeMinAvgViews = Number(minAvgViews || 250);
  const safeMinViewSubRatio = Number(minViewSubRatio || 0.01);
  const safeSearchOrder = cleanText(searchOrder || 'date').toLowerCase() === 'relevance' ? 'relevance' : 'date';
  const safePublishedAfterDays = Number(publishedAfterDays || 90);

  const publishedAfter = new Date(Date.now() - safePublishedAfterDays * DAY_MS).toISOString();
  const searchQueries = (queries || []).slice(0, 6);
  const randomizedQueries = [...searchQueries].sort(() => Math.random() - 0.5);
  const rawSearchItems = [];

  for (const q of randomizedQueries) {
    const fullQ = cleanText(location ? `${q} ${location}` : q);
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search?part=snippet` +
      `&q=${encodeURIComponent(fullQ)}` +
      `&type=video&order=${safeSearchOrder}&maxResults=25&relevanceLanguage=en` +
      `&publishedAfter=${encodeURIComponent(publishedAfter)}` +
      `&key=${YOUTUBE}`;

    try {
      const data = await fetchJson(searchUrl);
      if (data?.items?.length) rawSearchItems.push(...data.items);
    } catch (e) {
      console.error('YouTube video search failed:', e.message || e);
    }
  }

  if (!rawSearchItems.length) return [];

  const videoIds = dedupeProfiles(
    rawSearchItems
      .map((i) => ({ sourceId: i.id?.videoId }))
      .filter((i) => i.sourceId)
  ).map((i) => i.sourceId);

  const channelIds = dedupeProfiles(
    rawSearchItems
      .map((i) => ({ sourceId: i.snippet?.channelId }))
      .filter((i) => i.sourceId)
  ).map((i) => i.sourceId);

  if (!channelIds.length) return [];

  const videoById = new Map();
  for (const ids of chunk(videoIds, 50)) {
    const url =
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics` +
      `&id=${ids.join(',')}&maxResults=50&key=${YOUTUBE}`;
    try {
      const data = await fetchJson(url);
      for (const v of data?.items || []) {
        videoById.set(v.id, v);
      }
    } catch (e) {
      console.error('YouTube videos details failed:', e.message || e);
    }
  }

  const channelById = new Map();
  for (const ids of chunk(channelIds, 50)) {
    const url =
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics` +
      `&id=${ids.join(',')}&maxResults=50&key=${YOUTUBE}`;
    try {
      const data = await fetchJson(url);
      for (const c of data?.items || []) {
        channelById.set(c.id, c);
      }
    } catch (e) {
      console.error('YouTube channel details failed:', e.message || e);
    }
  }

  const videosByChannel = new Map();
  for (const item of rawSearchItems) {
    const chId = item?.snippet?.channelId;
    const vid = item?.id?.videoId;
    if (!chId || !vid || !videoById.has(vid)) continue;
    if (!videosByChannel.has(chId)) videosByChannel.set(chId, []);
    videosByChannel.get(chId).push(videoById.get(vid));
  }

  const candidates = [];
  for (const chId of channelIds) {
    const ch = channelById.get(chId);
    if (!ch) continue;

    const title = cleanText(ch.snippet?.title);
    const desc = cleanText(ch.snippet?.description).slice(0, 320);
    const titleLc = title.toLowerCase();

    if (
      !title ||
      titleLc.includes('- topic') ||
      titleLc.includes('vevo') ||
      titleLc.includes('official') ||
      isBadMarketplaceName(title)
    ) {
      continue;
    }

    const subs = Number(ch.statistics?.subscriberCount || 0);
    const videoCount = Number(ch.statistics?.videoCount || 0);
    if (subs < minSubs || subs > maxSubs) continue;
    if (videoCount < 15) continue;

    const recentVideos = (videosByChannel.get(chId) || [])
      .sort((a, b) => new Date(b.snippet?.publishedAt || 0) - new Date(a.snippet?.publishedAt || 0))
      .slice(0, 6);

    const avgRecentViews = recentVideos.length
      ? Math.round(recentVideos.reduce((sum, v) => sum + Number(v.statistics?.viewCount || 0), 0) / recentVideos.length)
      : 0;

    const lastUploadAt = recentVideos[0]?.snippet?.publishedAt || null;
    const lastUploadDays = daysSince(lastUploadAt);
    const viewSubRatio = subs > 0 ? avgRecentViews / subs : 0;

    // Skill-tunable quality gate for creator leads.
    if (lastUploadDays > safeMaxInactiveDays) continue;
    if (avgRecentViews < safeMinAvgViews) continue;
    if (viewSubRatio < safeMinViewSubRatio) continue;

    const custom = cleanText(ch.snippet?.customUrl);
    const profileUrl = custom
      ? `https://youtube.com/${custom.startsWith('@') ? custom : `@${custom}`}`
      : `https://youtube.com/channel/${ch.id}`;

    const profile = {
      sourceId: `yt:${ch.id}`,
      channelId: ch.id,
      name: title,
      description: desc,
      profileUrl,
      platform: 'YouTube',
      followers: formatSubs(subs),
      subscriberCount: subs,
      videoCount,
      avgRecentViews,
      viewSubRatio: Number(viewSubRatio.toFixed(4)),
      lastUploadDays,
      country: cleanText(ch.snippet?.country || 'Unknown'),
      contactPath: 'YouTube About page + channel links + latest video comments',
    };

    profile.qualityScore = scoreCreatorProfile(profile, { minSubs, maxSubs });
    candidates.push(profile);
  }

  return candidates
    .sort((a, b) => b.qualityScore - a.qualityScore || a.subscriberCount - b.subscriberCount)
    .slice(0, 20);
}

async function runApifyMaps(query, APIFY) {
  if (!APIFY) return [];
  try {
    const url =
      `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items` +
      `?token=${APIFY}&timeout=45`;

    const data = await fetchJson(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchStringsArray: [query],
          maxCrawledPlacesPerSearch: 10,
          language: 'en',
        }),
      },
      25000
    );

    if (!Array.isArray(data)) return [];

    return data.slice(0, 20).map((item, idx) => {
      const p = {
        sourceId: `maps:apify:${idx}:${lower(item.title)}`,
        name: cleanText(item.title),
        description: cleanText(item.categoryName || 'Business'),
        rating: Number(item.totalScore || 0),
        reviews: Number(item.reviewsCount || 0),
        phone: cleanText(item.phone || ''),
        website: cleanText(item.website || ''),
        profileUrl: cleanText(item.website || item.url || ''),
        platform: 'Google Maps',
      };
      p.qualityScore = scoreMapsProfile(p);
      return p;
    });
  } catch (e) {
    console.error('Apify Maps error:', e.message || e);
    return [];
  }
}

async function runSerpMaps(query, SERP) {
  if (!SERP) return [];
  try {
    const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&type=search&api_key=${SERP}`;
    const data = await fetchJson(url);

    return (data.local_results || []).slice(0, 20).map((r, idx) => {
      const p = {
        sourceId: `maps:serp:${idx}:${lower(r.title)}`,
        name: cleanText(r.title),
        description: cleanText(r.type || 'Business'),
        rating: Number(r.rating || 0),
        reviews: Number(r.reviews || 0),
        phone: cleanText(r.phone || ''),
        website: cleanText(r.website || ''),
        profileUrl: cleanText(r.website || ''),
        platform: 'Google Maps',
      };
      p.qualityScore = scoreMapsProfile(p);
      return p;
    });
  } catch (e) {
    console.error('SerpApi Maps error:', e.message || e);
    return [];
  }
}

async function runSerpGoogle(query, { SERP, excludeTerms = [], allowDomains = [] }) {
  if (!SERP) return [];

  const globalBad = [
    'fiverr', 'upwork', 'freelancer.com', 'veed', 'canva', 'agency',
    'hire', 'list', 'top 10', 'best ', 'template',
    'theme', 'how to', 'reddit', 'quora', 'youtube.com/watch', 'facebook.com/groups'
  ];

  try {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=20&api_key=${SERP}`;
    const data = await fetchJson(url);

    const allow = (allowDomains || []).map((d) => d.toLowerCase());
    const allBad = [...globalBad, ...(excludeTerms || []).map((e) => e.toLowerCase())];

    const filtered = (data.organic_results || []).filter((r) => {
      const link = lower(r.link);
      const title = lower(r.title);
      const host = getHost(link);

      if (!link || !host) return false;
      if (allBad.some((k) => link.includes(k) || title.includes(k))) return false;
      if (allow.length && !allow.some((d) => host.includes(d))) return false;

      return true;
    });

    return filtered.slice(0, 20).map((r, idx) => {
      const link = cleanText(r.link);
      const host = getHost(link);
      const p = {
        sourceId: `serp:${host}:${idx}`,
        name: cleanText(r.title),
        description: cleanText(r.snippet).slice(0, 300),
        profileUrl: link,
        platform: host.includes('youtube.com') ? 'YouTube'
          : host.includes('instagram.com') ? 'Instagram'
          : host.includes('linkedin.com') ? 'LinkedIn'
          : host.includes('tiktok.com') ? 'TikTok'
          : host.includes('myshopify.com') ? 'Shopify'
          : host.includes('producthunt.com') ? 'Product Hunt'
          : 'Website',
      };
      p.qualityScore = scoreSerpProfile(p, {});
      return p;
    });
  } catch (e) {
    console.error('SerpApi Google error:', e.message || e);
    return [];
  }
}

function qualityGate(profiles, cfg) {
  return (profiles || []).filter((p) => {
    if (!p || !p.name || !p.profileUrl) return false;
    if (isBadMarketplaceName(p.name)) return false;

    const title = lower(p.name);
    const desc = lower(p.description);
    if (MARKETPLACE_BLOCKLIST.some((k) => title.includes(k) || desc.includes(k))) return false;

    if ((cfg?.targetType === 'creator') || p.platform === 'YouTube') {
      // Creator quality gate: no generic websites for creator skill paths.
      if (p.platform !== 'YouTube') return false;
      if (!Number.isFinite(Number(p.subscriberCount))) return false;
      if (Number(p.subscriberCount) < Number(cfg?.minSubs || 0)) return false;
      if (Number(p.subscriberCount) > Number(cfg?.maxSubs || 1_000_000)) return false;
      if (Number(p.lastUploadDays || 999) > Number(cfg?.maxInactiveDays || 60)) return false;
      if (Number(p.avgRecentViews || 0) < Number(cfg?.minAvgViews || 250)) return false;
      if (Number(p.viewSubRatio || 0) < Number(cfg?.minViewSubRatio || 0.01)) return false;
      return true;
    }

    // Business quality gate.
    if (p.platform === 'Website' && !p.description) return false;
    if (!p.profileUrl.startsWith('http')) return false;

    return true;
  });
}

function basicProfileGate(profiles, cfg) {
  return (profiles || []).filter((p) => {
    if (!p || !p.name || !p.profileUrl) return false;
    if (!p.profileUrl.startsWith('http')) return false;
    if (isBadMarketplaceName(p.name)) return false;

    const title = lower(p.name);
    const desc = lower(p.description);
    if (MARKETPLACE_BLOCKLIST.some((k) => title.includes(k) || desc.includes(k))) return false;

    if ((cfg?.targetType === 'creator') || p.platform === 'YouTube') {
      if (p.platform !== 'YouTube') return false;
      if (!Number.isFinite(Number(p.subscriberCount || 0))) return false;
      if (Number(p.subscriberCount || 0) <= 0) return false;
    }

    return true;
  });
}

function quickRecoveryGate(profiles, cfg) {
  return (profiles || []).filter((p) => {
    if (!p || !p.name || !p.profileUrl) return false;
    if (!p.profileUrl.startsWith('http')) return false;
    if (isBadMarketplaceName(p.name)) return false;

    if ((cfg?.targetType === 'creator') || p.platform === 'YouTube') {
      if (p.platform !== 'YouTube') return false;

      const subs = Number(p.subscriberCount || 0);
      if (!Number.isFinite(subs) || subs <= 0) return false;
      if (subs < Math.max(300, Number(cfg?.minSubs || 2000) - 2500)) return false;
      if (subs > Number(cfg?.maxSubs || 100000) + 150000) return false;

      if (Number(p.lastUploadDays || 999) > Math.max(150, Number(cfg?.maxInactiveDays || 60))) return false;
      if (Number(p.avgRecentViews || 0) < Math.max(60, Number(cfg?.minAvgViews || 250) - 180)) return false;
      if (Number(p.viewSubRatio || 0) < Math.max(0.002, Number(cfg?.minViewSubRatio || 0.01) - 0.007)) return false;
      return true;
    }

    if (p.platform === 'Google Maps') {
      return !!(p.website || p.phone || p.profileUrl);
    }

    return true;
  });
}

function buildQuickCandidatePool(rawProfiles, cfg) {
  const base = dedupeProfiles(rawProfiles);
  const strict = qualityGate(base, cfg);
  if (strict.length >= 3) return strict;

  const soft = quickRecoveryGate(base, cfg);
  const merged = dedupeProfiles([...strict, ...soft]);
  if (merged.length >= 3) return merged;

  const basic = basicProfileGate(base, cfg);
  return dedupeProfiles([...merged, ...basic]);
}

function buildSkillFallbackText(profile, skill, cfg, siteSignal = null) {
  const rule = SKILL_INTENT_RULES[skill] || null;
  const requiredWord = rule?.requiredAny?.[0] || 'conversion';
  const signalText = siteSignal?.summary || null;

  if ((cfg?.targetType === 'creator') || profile.platform === 'YouTube') {
    const problem = `Their recent uploads show ${requiredWord} upside, especially across newer videos with inconsistent packaging.`;
    const strategy = `Pitch a low-risk sprint focused on ${requiredWord} gains with 3 test deliverables and quick A/B feedback.`;
    return { problem, strategy };
  }

  const baseProblem = signalText
    ? `Their website likely has ${signalText}, which can hurt lead-to-client conversion.`
    : `Their buyer journey likely has a ${requiredWord} gap that is costing qualified leads.`;
  const strategy = `Lead with one specific fix and offer a 7-day starter implementation tied to ${requiredWord}.`;
  return { problem: baseProblem, strategy };
}

function hasAny(text, arr = []) {
  const t = lower(text);
  return arr.some((v) => t.includes(lower(v)));
}

function isTooGenericText(text) {
  const t = lower(text);
  const genericHits = GENERIC_PHRASES.filter((p) => t.includes(p)).length;
  return genericHits >= 1;
}

function applyIntentRules(lead, profile, skill, cfg, siteSignal = null) {
  const rules = SKILL_INTENT_RULES[skill] || null;
  const seed = buildSkillFallbackText(profile, skill, cfg, siteSignal);
  const merged = { ...lead };

  if (!cleanText(merged.problem)) merged.problem = seed.problem;
  if (!cleanText(merged.strategy)) merged.strategy = seed.strategy;

  const allText = `${merged.problem} ${merged.strategy} ${merged.reason || ''} ${merged.jobDesc || ''}`;
  const hasRequired = !rules?.requiredAny?.length || hasAny(allText, rules.requiredAny);
  const hasForbidden = !!rules?.forbiddenAny?.length && hasAny(allText, rules.forbiddenAny);
  const generic = isTooGenericText(allText);

  if (!hasRequired || hasForbidden || generic) {
    merged.problem = seed.problem;
    merged.strategy = seed.strategy;
    merged.reason = `High service-to-pain fit for ${skill}.`;
    merged.jobDesc = `Need help with ${skill} to improve ${rules?.requiredAny?.[0] || 'conversion'} and close growth gaps.`;
  }

  return merged;
}

function getNicheBucket(profile, skill) {
  const rule = SKILL_INTENT_RULES[skill];
  if (rule?.niche) return rule.niche;
  if (profile.platform === 'YouTube') return 'creator';
  if (profile.platform === 'Google Maps') return 'local-business';
  if (profile.platform === 'LinkedIn') return 'linkedin';
  if (profile.platform === 'Shopify') return 'shopify';
  if (profile.platform === 'Product Hunt') return 'saas';
  return 'web';
}

function pickDiverseTopLeads(leads, profilesById, skill, maxLeads = 3) {
  const selected = [];
  const usedDomains = new Set();
  const usedBuckets = new Set();

  for (const lead of leads) {
    if (selected.length >= maxLeads) break;
    const profile = profilesById.get(lead.sourceId);
    if (!profile) continue;

    const root = getRootDomain(profile.profileUrl);
    const bucket = getNicheBucket(profile, skill);

    if (root && usedDomains.has(root)) continue;
    if (usedBuckets.has(bucket)) continue;

    selected.push(lead);
    if (root) usedDomains.add(root);
    usedBuckets.add(bucket);
  }

  if (selected.length < maxLeads) {
    for (const lead of leads) {
      if (selected.length >= maxLeads) break;
      if (!selected.find((x) => x.sourceId === lead.sourceId)) selected.push(lead);
    }
  }

  return selected.slice(0, maxLeads);
}

async function readSiteSignals(profileUrl) {
  const root = getRootDomain(profileUrl);
  if (!root) return null;

  let timer = null;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 2200);
    const text = await fetch(`https://r.jina.ai/http://${root}`, { signal: controller.signal }).then((r) => r.text());
    const page = lower(text).slice(0, 9000);

    const signals = {
      hasPricing: page.includes('pricing') || page.includes('plans'),
      hasBooking: page.includes('book a call') || page.includes('schedule') || page.includes('book now'),
      hasSocialProof: page.includes('testimonial') || page.includes('case study') || page.includes('trusted by'),
      hasLeadMagnet: page.includes('newsletter') || page.includes('free guide') || page.includes('download'),
    };

    const missing = [];
    if (!signals.hasPricing) missing.push('unclear pricing');
    if (!signals.hasBooking) missing.push('weak booking CTA');
    if (!signals.hasSocialProof) missing.push('low trust proof');
    if (!signals.hasLeadMagnet) missing.push('no lead magnet');

    return {
      ...signals,
      summary: missing.slice(0, 2).join(' + ') || 'basic conversion friction',
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function enrichSiteSignalsForProfiles(profiles, cfg, opts = {}) {
  if ((cfg?.targetType === 'creator')) return profiles;
  if (!opts?.enabled) return profiles;

  const maxProfiles = Number(opts?.maxProfiles || 6);
  const head = (profiles || []).slice(0, maxProfiles);
  const tail = (profiles || []).slice(maxProfiles);

  const enrichedHead = await Promise.all(
    head.map(async (p) => {
      const siteSignal = await readSiteSignals(p.profileUrl);
      return { ...p, siteSignal };
    })
  );

  return [...enrichedHead, ...tail];
}

const SERVICE_RULES = {
  thumbnails: ['thumbnail', 'ctr', 'title', 'packaging', 'youtube'],
  copywriting: ['copy', 'sales page', 'product description', 'ad copy', 'landing page'],
  funnel: ['funnel', 'lead', 'booking', 'pipeline', 'conversion', 'cta'],
  'social-media': ['social', 'instagram', 'tiktok', 'reels', 'posting', 'engagement'],
  email: ['email', 'newsletter', 'sequence', 'klaviyo', 'mailchimp', 'list'],
};

const SKILL_TO_SERVICE = {
  'Thumbnail Design': 'thumbnails',
  'Copywriting': 'copywriting',
  'Funnel Building': 'funnel',
  'Social Media Management': 'social-media',
  'Email Marketing': 'email',
};

function hasMonetizationLink(profile) {
  const text = lower(`${profile?.description || ''} ${profile?.profileUrl || ''}`);
  const tokens = ['patreon', 'sponsor', 'affiliate', 'course', 'shop', 'store', 'pricing', 'book', 'consult', 'membership', 'buy'];
  return tokens.some((t) => text.includes(t));
}

function inferPainScore(profile, cfg) {
  let pain = 58;
  const isCreator = (cfg?.targetType === 'creator') || profile.platform === 'YouTube';

  if (isCreator) {
    const d = Number(profile.lastUploadDays || 999);
    const ratio = Number(profile.viewSubRatio || 0);
    const views = Number(profile.avgRecentViews || 0);

    if (d <= 7) pain += 12;
    else if (d <= 14) pain += 9;
    else if (d <= 30) pain += 5;

    if (ratio < 0.03) pain += 18;
    else if (ratio < 0.05) pain += 13;
    else if (ratio < 0.08) pain += 7;

    if (views < 800) pain += 10;
    else if (views < 1800) pain += 5;

    if (!hasMonetizationLink(profile)) pain += 8;
  } else {
    const sig = profile.siteSignal || {};
    if (sig && !sig.hasBooking) pain += 10;
    if (sig && !sig.hasPricing) pain += 10;
    if (sig && !sig.hasSocialProof) pain += 8;
    if (sig && !sig.hasLeadMagnet) pain += 6;

    if (!profile.website && !profile.phone) pain += 7;
    if (Number(profile.rating || 0) > 0 && Number(profile.rating || 0) < 4.2) pain += 6;
    if (Number(profile.reviews || 0) > 0 && Number(profile.reviews || 0) < 35) pain += 5;
  }

  return clamp(Math.round(pain), 55, 99);
}

function profileAudiencePass(profile, cfg, audienceBucket) {
  if (!audienceBucket || audienceBucket === 'all') return true;
  const isCreator = (cfg?.targetType === 'creator') || profile.platform === 'YouTube';

  if (isCreator) {
    const subs = Number(profile.subscriberCount || 0);
    if (!Number.isFinite(subs) || subs <= 0) return true;
    if (audienceBucket === 'beginner') return subs < 10000;
    if (audienceBucket === 'growing') return subs >= 10000 && subs <= 50000;
    if (audienceBucket === 'established') return subs > 50000;
    return true;
  }

  const reviews = Number(profile.reviews || 0);
  if (!Number.isFinite(reviews) || reviews <= 0) return true;
  if (audienceBucket === 'beginner') return reviews < 30;
  if (audienceBucket === 'growing') return reviews >= 30 && reviews <= 150;
  if (audienceBucket === 'established') return reviews > 150;
  return true;
}

function detectServiceTags(profile, skill) {
  const text = lower(`${profile.name || ''} ${profile.description || ''} ${profile.platform || ''}`);
  const tags = new Set();

  for (const [tag, keywords] of Object.entries(SERVICE_RULES)) {
    if (keywords.some((k) => text.includes(k))) tags.add(tag);
  }

  const skillTag = SKILL_TO_SERVICE[skill];
  if (skillTag) tags.add(skillTag);

  if (profile.platform === 'YouTube') tags.add('thumbnails');
  if (profile.platform === 'LinkedIn') {
    tags.add('copywriting');
    tags.add('email');
  }
  if (profile.platform === 'Instagram' || profile.platform === 'TikTok') tags.add('social-media');

  return [...tags];
}

function profileServicePass(profile, selectedServices = [], skill = null) {
  if (!selectedServices.length) return true;
  const tags = new Set(detectServiceTags(profile, skill));
  return selectedServices.some((s) => tags.has(s));
}

function applyAdvancedProfileFilters(profiles, cfg, advanced = {}, skill = null) {
  const {
    audienceBucket = 'all',
    serviceFilters = [],
    hotLeadsOnly = false,
    filterHighPain = false,
    filterActive7d = false,
    filterNoMonetization = false,
  } = advanced || {};

  const isCreatorMode = (cfg?.targetType === 'creator');

  return (profiles || []).filter((p) => {
    const painScore = inferPainScore(p, cfg);
    p.painScore = painScore;
    p.serviceTags = detectServiceTags(p, skill);

    if (!profileAudiencePass(p, cfg, audienceBucket)) return false;
    if (!profileServicePass(p, serviceFilters, skill)) return false;

    if (hotLeadsOnly) {
      if (Number(p.qualityScore || 0) < 80) return false;
      if (painScore < 78) return false;
      if (!p.profileUrl) return false;
      if (isCreatorMode || p.platform === 'YouTube') {
        if (Number(p.lastUploadDays || 999) > 30) return false;
      }
    }

    if (filterHighPain && painScore < 90) return false;

    if (filterActive7d && ((isCreatorMode || p.platform === 'YouTube'))) {
      if (Number(p.lastUploadDays || 999) > 7) return false;
    }

    if (filterNoMonetization) {
      if ((isCreatorMode || p.platform === 'YouTube') && hasMonetizationLink(p)) return false;
      if (!(isCreatorMode || p.platform === 'YouTube')) {
        const sig = p.siteSignal || null;
        if (sig && (sig.hasPricing || sig.hasBooking)) return false;
      }
    }

    return true;
  });
}

function rankProfiles(profiles, cfg, signals = [], budget = []) {
  const signalSet = new Set((signals || []).map((s) => lower(s)));
  const budgetSet = new Set((budget || []).map((b) => lower(b)));

  return (profiles || [])
    .map((p) => {
      let score = Number(scoreByChannel(p, cfg) || 60);

      if ((cfg?.targetType === 'creator') || p.platform === 'YouTube') {
        if (signalSet.has('active-posting') && Number(p.lastUploadDays || 999) <= 14) score += 3;
        if (signalSet.has('high-engagement') && Number(p.viewSubRatio || 0) >= 0.08) score += 4;
        if (budgetSet.has('low-ticket') && Number(p.subscriberCount || 0) <= 30000) score += 2;
      } else if (p.platform === 'Google Maps') {
        if (signalSet.has('high-intent') && (p.website || p.phone)) score += 4;
        if (budgetSet.has('mid-ticket') && Number(p.reviews || 0) >= 50) score += 3;
      } else {
        if (signalSet.has('high-intent') && p.profileUrl) score += 3;
        if (budgetSet.has('mid-ticket')) score += 2;
      }

      return { ...p, qualityScore: clamp(Math.round(score), 55, 99) };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);
}

function fallbackLeadFromProfile(profile, skill, cfg) {
  const match = clamp(Number(profile.qualityScore || 80), 75, 99);
  const replyChance = clamp(Math.round(35 + (match - 70) * 1.0), 35, 90);

  const followerText = profile.followers || 'Not listed';
  const problem = (cfg?.targetType === 'creator')
    ? `${profile.name} is uploading actively but likely has thumbnail CTR headroom they can monetize quickly.`
    : `${profile.name} has visible demand signals but likely has conversion leaks they are not fixing fast.`;

  const strategy = (cfg?.targetType === 'creator')
    ? `Pitch with one quick thumbnail teardown of a recent video and offer a 3-thumbnail test sprint.`
    : `Lead with one concrete conversion issue and offer a low-risk starter implementation.`;

  return {
    sourceId: profile.sourceId,
    name: profile.name,
    platform: profile.platform,
    followers: followerText,
    problem,
    strategy,
    match,
    reason: 'Strong intent and clear service-to-pain fit.',
    whyNow: 'They are currently active, so outreach timing is favorable this week.',
    redFlag: null,
    closingHint: 'Offer a tiny first deliverable to reduce risk and increase reply rate.',
    replyChance,
    jobDesc: `Need help with ${skill || 'freelance support'} to improve results quickly.`,
    profileUrl: profile.profileUrl,
    dealValue: PRICE_HINTS[skill] || PRICE_HINTS.default,
  };
}

async function enrichWithGroq({ GROQ, profiles, skill, incomeGoal, cfg, leadLimit = 3, candidateLimit = 12 }) {
  const safeLeadLimit = clamp(Number(leadLimit || 3), 3, 20);
  const safeCandidateLimit = clamp(Number(candidateLimit || 12), 8, 40);
  const candidates = profiles.slice(0, safeCandidateLimit);
  if (!candidates.length) return [];
  const byId = new Map(candidates.map((p) => [p.sourceId, p]));
  const rules = SKILL_INTENT_RULES[skill] || null;

  if (!GROQ) {
    const leads = candidates.slice(0, Math.max(6, safeLeadLimit * 2)).map((p) => {
      const base = fallbackLeadFromProfile(p, skill, cfg);
      return applyIntentRules(base, p, skill, cfg, p.siteSignal || null);
    });
    return pickDiverseTopLeads(leads, byId, skill, safeLeadLimit);
  }

  const candidatesPayload = candidates.map((p) => ({
    sourceId: p.sourceId,
    name: p.name,
    platform: p.platform,
    followers: p.followers,
    subscriberCount: p.subscriberCount || null,
    avgRecentViews: p.avgRecentViews || null,
    viewSubRatio: p.viewSubRatio || null,
    lastUploadDays: p.lastUploadDays || null,
    qualityScore: p.qualityScore,
    profileUrl: p.profileUrl,
    description: p.description,
    contactPath: p.contactPath || null,
  }));

  const creatorNote = (cfg?.targetType === 'creator')
    ? 'Creator skill selected: prioritize active small creators with 3k-50k subscribers and solid recent view activity.'
    : 'Business skill selected: prioritize leads with clear hiring intent and obvious conversion gaps.';

  const incomeContext = incomeGoal ? `Freelancer income goal: ${incomeGoal}. Keep pricing realistic for beginners.` : '';

  const prompt = `You are selecting the best freelance outreach leads.
${creatorNote}
${incomeContext}

Candidates (you MUST choose from these sourceId values only):
${JSON.stringify(candidatesPayload, null, 2)}

Rules:
- Use ONLY sourceId values from candidates.
- Never invent URLs, names, or follower counts.
- Avoid generic statements. Keep problem/strategy specific to each candidate.
- Skill intent rules:
  - Required keywords (at least one): ${JSON.stringify(rules?.requiredAny || [])}
  - Forbidden keywords: ${JSON.stringify(rules?.forbiddenAny || [])}
- redFlag must be null or one concise warning.

Return JSON array with max ${safeLeadLimit} items:
[
  {
    "sourceId": "candidate sourceId",
    "problem": "1 sentence specific pain",
    "strategy": "1 sentence outreach strategy",
    "reason": "why this lead fits the skill",
    "whyNow": "why this week matters",
    "redFlag": null,
    "closingHint": "short beginner-friendly closing tip",
    "replyChance": 35,
    "jobDesc": "what they might post on Upwork",
    "dealValue": "$X - $Y"
  }
]

Return raw JSON only.`;

  try {
    const data = await fetchJson(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1600,
          temperature: 0.25,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      25000
    );

    const rawText = data?.choices?.[0]?.message?.content || '[]';
    let ai = [];
    try {
      ai = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch {
      ai = [];
    }

    const leads = (Array.isArray(ai) ? ai : [])
      .map((x) => {
        const p = byId.get(x?.sourceId);
        if (!p) return null;

        const match = clamp(Number(p.qualityScore || 82), 75, 99);
        const replyChance = clamp(Number(x?.replyChance || Math.round(35 + (match - 70) * 1.0)), 35, 90);

        const lead = {
          sourceId: p.sourceId,
          name: p.name,
          platform: p.platform,
          followers: p.followers || 'Not listed',
          problem: cleanText(x?.problem) || fallbackLeadFromProfile(p, skill, cfg).problem,
          strategy: cleanText(x?.strategy) || fallbackLeadFromProfile(p, skill, cfg).strategy,
          match,
          reason: cleanText(x?.reason) || 'Strong intent and clear service-to-pain fit.',
          whyNow: cleanText(x?.whyNow) || 'Outreach timing is favorable this week.',
          redFlag: !x?.redFlag || ['null', 'none', 'n/a', ''].includes(lower(x.redFlag)) ? null : cleanText(x.redFlag),
          closingHint: cleanText(x?.closingHint) || 'Offer a tiny first deliverable to reduce risk.',
          replyChance,
          jobDesc: cleanText(x?.jobDesc) || `Need help with ${skill || 'freelance support'} to improve results quickly.`,
          profileUrl: p.profileUrl,
          dealValue: cleanText(x?.dealValue) || PRICE_HINTS[skill] || PRICE_HINTS.default,
        };

        return applyIntentRules(lead, p, skill, cfg, p.siteSignal || null);
      })
      .filter(Boolean)
      .sort((a, b) => b.match - a.match);

    if (leads.length) return pickDiverseTopLeads(leads, byId, skill, safeLeadLimit);
  } catch (e) {
    console.error('Groq enrichment failed:', e.message || e);
  }

  const fallbackLeads = candidates.slice(0, Math.max(6, safeLeadLimit * 2)).map((p) => {
    const base = fallbackLeadFromProfile(p, skill, cfg);
    return applyIntentRules(base, p, skill, cfg, p.siteSignal || null);
  });
  return pickDiverseTopLeads(fallbackLeads, byId, skill, safeLeadLimit);
}

function ensureQuickMinimumLeads(leads, rankedProfiles, skill, cfg, minCount = 3) {
  const ranked = Array.isArray(rankedProfiles) ? rankedProfiles : [];
  const byId = new Map(ranked.map((p) => [p.sourceId, p]));

  const safeLeads = (Array.isArray(leads) ? leads : [])
    .filter((l) => l && l.sourceId && byId.has(l.sourceId));

  const usedIds = new Set(safeLeads.map((l) => l.sourceId));
  const fallbackAdds = [];

  for (const p of ranked) {
    if (usedIds.has(p.sourceId)) continue;
    const base = fallbackLeadFromProfile(p, skill, cfg);
    fallbackAdds.push(applyIntentRules(base, p, skill, cfg, p.siteSignal || null));
    usedIds.add(p.sourceId);
    if (safeLeads.length + fallbackAdds.length >= Math.max(1, minCount)) break;
  }

  const merged = [...safeLeads, ...fallbackAdds];
  return pickDiverseTopLeads(merged, byId, skill, minCount);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const {
    type = 'Local Businesses',
    prompt = '',
    platform = 'all',
    skill = null,
    mode = 'quick',
    incomeGoal = null,
    signals = [],
    budget = [],
  } = body;

  const isQuickMode = lower(mode).includes('quick');
  const effectivePrompt = cleanText(prompt)
    || (cleanText(skill) ? `${cleanText(skill)} leads` : '')
    || (isQuickMode ? `${cleanText(type)} leads` : '');

  if (!effectivePrompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  const SERP = process.env.SERPAPI_KEY;
  const GROQ = process.env.GROQ_API_KEY;
  const APIFY = process.env.APIFY_API_TOKEN;
  const YOUTUBE = process.env.YOUTUBE_API_KEY;

  let rawProfiles = [];

  try {
    const cfg = skill ? SKILL_CONFIG[skill] : null;
    const location = extractLocation(effectivePrompt);
    const advanced = normalizeAdvancedControls(body);
    const normalizedSignals = normalizeSignalTokens(signals);
    const normalizedBudget = normalizeBudgetTokens(budget);
    const planTier = resolvePlanTier(body);
    const leadTarget = computeLeadTarget({ incomeGoal, skill, planTier });
    const rankWindow = clamp(Math.max(12, leadTarget.requestedLeadCount * 4), 12, leadTarget.planMaxCandidates);

    if (isQuickMode && skill && cfg) {
      if (cfg.method === 'youtube') {
        rawProfiles = await searchYouTubeCreators({
          YOUTUBE,
          queries: cfg.ytQueries,
          location,
          minSubs: cfg.minSubs,
          maxSubs: cfg.maxSubs,
          maxInactiveDays: cfg.maxInactiveDays || 60,
          minAvgViews: cfg.minAvgViews || 250,
          minViewSubRatio: cfg.minViewSubRatio || 0.01,
          searchOrder: cfg.searchOrder || 'date',
          publishedAfterDays: cfg.publishedAfterDays || 90,
        });

        // Retry with broader creator discovery if strict pass returns too few leads.
        if (rawProfiles.length < Number(cfg.minLeadCount || 3)) {
          const broaderQueries = [
            ...(cfg.ytQueries || []),
            `${cleanText(skill)} youtube channel`,
            `${cleanText(skill)} creator`,
            cleanText(effectivePrompt).replace(/\bin [^,]+$/i, ''),
          ].filter(Boolean);

          const retryProfiles = await searchYouTubeCreators({
            YOUTUBE,
            queries: broaderQueries,
            location,
            minSubs: Math.max(500, Number(cfg.minSubs || 2000) - 1500),
            maxSubs: Number(cfg.maxSubs || 70000) + 40000,
            maxInactiveDays: Math.max(120, Number(cfg.maxInactiveDays || 60)),
            minAvgViews: Math.max(80, Number(cfg.minAvgViews || 250) - 120),
            minViewSubRatio: Math.max(0.003, Number(cfg.minViewSubRatio || 0.01) - 0.004),
            searchOrder: 'relevance',
            publishedAfterDays: Math.max(270, Number(cfg.publishedAfterDays || 90)),
          });

          rawProfiles = dedupeProfiles([...rawProfiles, ...retryProfiles]);
        }

        // Important: for creator skills we avoid generic web fallback by default.
        if (!rawProfiles.length && cfg.allowWebFallback) {
          rawProfiles = await runSerpGoogle(`${skill} creator ${location} -agency -fiverr -upwork`, {
            SERP,
            excludeTerms: ['agency', 'fiverr', 'upwork', 'template', 'tool', 'software'],
            allowDomains: ['youtube.com', 'instagram.com', 'tiktok.com'],
          });
        }
      } else if (cfg.method === 'maps') {
        const mapsQ = location ? `${cfg.apifyMaps} in ${location}` : cfg.apifyMaps;
        rawProfiles = await runSerpMaps(cfg.serpQuery + (location ? ` in ${location}` : ''), SERP);
        if (!rawProfiles.length) rawProfiles = await runApifyMaps(mapsQ, APIFY);
      } else if (cfg.method === 'serp') {
        const serpQ = location ? `${cfg.serpQuery} ${location}` : cfg.serpQuery;
        rawProfiles = await runSerpGoogle(serpQ, {
          SERP,
          excludeTerms: cfg.exclude || [],
          allowDomains: cfg.allowDomains || [],
        });

        // Quick-find resilience for SEO/Content Writing: broaden to website-heavy queries when needed.
        if ((skill === 'SEO' || skill === 'Content Writing') && rawProfiles.length < 3) {
          const altQueries = skill === 'SEO'
            ? [
              `${cleanText(effectivePrompt)} website -agency -"seo services"`,
              `small business website needs SEO -agency -fiverr -upwork`,
            ]
            : [
              `${cleanText(effectivePrompt)} blog website -agency -"content writing services"`,
              `startup website blog content gaps -agency -fiverr -upwork`,
            ];

          const extra = [];
          for (const q of altQueries) {
            const chunked = await runSerpGoogle(q, {
              SERP,
              excludeTerms: cfg.exclude || [],
              allowDomains: [],
            });
            extra.push(...chunked);
            if (extra.length >= 12) break;
          }

          rawProfiles = dedupeProfiles([...rawProfiles, ...extra]);
        }
      }

      // Last quick fallback: one broad pass so skill-only quick mode doesn't go empty too easily.
      if (!rawProfiles.length) {
        if (cfg.targetType === 'creator') {
          rawProfiles = await searchYouTubeCreators({
            YOUTUBE,
            queries: [
              `${cleanText(skill)} youtube`,
              `small youtube creator ${cleanText(skill)}`,
              'youtube creator channel',
            ],
            location: '',
            minSubs: 600,
            maxSubs: 180000,
            maxInactiveDays: 180,
            minAvgViews: 60,
            minViewSubRatio: 0.002,
            searchOrder: 'relevance',
            publishedAfterDays: 365,
          });
        } else if (cfg.method === 'maps') {
          rawProfiles = await runSerpMaps(`${cleanText(skill)} services ${location || ''}`.trim(), SERP);
          if (!rawProfiles.length) {
            rawProfiles = await runSerpGoogle(`${cleanText(skill)} business website ${location || ''}`.trim(), {
              SERP,
              excludeTerms: cfg.exclude || [],
              allowDomains: [],
            });
          }
        } else {
          rawProfiles = await runSerpGoogle(`${cleanText(skill)} business website ${location || ''}`.trim(), {
            SERP,
            excludeTerms: cfg.exclude || [],
            allowDomains: [],
          });
        }
      }
    } else {
      // Deep mode keeps broad categories, but still passes through quality gate + ranking.
      if (type === 'Local Businesses') {
        rawProfiles = await runApifyMaps(effectivePrompt, APIFY);
        if (!rawProfiles.length) rawProfiles = await runSerpMaps(effectivePrompt, SERP);
      } else if (type === 'Content Creators') {
        rawProfiles = await searchYouTubeCreators({
          YOUTUBE,
          queries: [effectivePrompt],
          location,
          minSubs: 2000,
          maxSubs: platform === 'youtube' ? 100000 : 70000,
        });
      } else if (type === 'Startups') {
        rawProfiles = await runSerpGoogle(`site:producthunt.com/products ${effectivePrompt}`, {
          SERP,
          allowDomains: ['producthunt.com'],
        });
      } else if (type === 'E-commerce Brands') {
        rawProfiles = await runSerpGoogle(`site:myshopify.com ${effectivePrompt} -blog -list -template`, {
          SERP,
          allowDomains: ['myshopify.com'],
          excludeTerms: ['blog', 'template', 'top 10'],
        });
      } else if (type === 'Coaches & Consultants') {
        rawProfiles = await runSerpGoogle(`site:linkedin.com/in ${effectivePrompt} coach OR consultant -recruiter`, {
          SERP,
          allowDomains: ['linkedin.com'],
        });
      } else {
        rawProfiles = await runSerpGoogle(effectivePrompt, { SERP });
      }
    }

    let gateCfg = cfg;
    if (isQuickMode && cfg?.targetType === 'creator' && rawProfiles.length < Number(cfg?.minLeadCount || 3)) {
      gateCfg = {
        ...cfg,
        minSubs: Math.max(800, Number(cfg.minSubs || 2000) - 800),
        maxInactiveDays: Math.max(120, Number(cfg.maxInactiveDays || 60)),
        minAvgViews: Math.max(90, Number(cfg.minAvgViews || 250) - 80),
        minViewSubRatio: Math.max(0.003, Number(cfg.minViewSubRatio || 0.01) - 0.003),
      };
    }

    const dedupedRaw = dedupeProfiles(rawProfiles);
    const gated = isQuickMode
      ? buildQuickCandidatePool(dedupedRaw, gateCfg)
      : qualityGate(dedupedRaw, gateCfg);

    // Keep Quick Find behavior unchanged. Advanced controls are applied only in deep/advanced mode.
    const advancedScoped = isQuickMode
      ? gated
      : applyAdvancedProfileFilters(gated, cfg, advanced, skill);

    const prelimRanked = rankProfiles(advancedScoped, cfg, normalizedSignals, normalizedBudget).slice(0, rankWindow);
    const withSiteSignals = await enrichSiteSignalsForProfiles(prelimRanked, cfg, {
      enabled: !isQuickMode && !cfg?.quickSkipSiteSignals,
      maxProfiles: isQuickMode ? 0 : 6,
    });
    const advancedAfterSignals = isQuickMode
      ? withSiteSignals
      : applyAdvancedProfileFilters(withSiteSignals, cfg, advanced, skill);
    let ranked = rankProfiles(advancedAfterSignals, cfg, normalizedSignals, normalizedBudget).slice(0, rankWindow);

    if (!ranked.length && isQuickMode && dedupedRaw.length) {
      const emergencyCfg = {
        ...(gateCfg || {}),
        minSubs: 0,
        maxSubs: Math.max(250000, Number(gateCfg?.maxSubs || 100000)),
        maxInactiveDays: Math.max(180, Number(gateCfg?.maxInactiveDays || 60)),
        minAvgViews: 40,
        minViewSubRatio: 0.001,
      };
      const emergencyPool = buildQuickCandidatePool(dedupedRaw, emergencyCfg);
      ranked = rankProfiles(emergencyPool, emergencyCfg, normalizedSignals, normalizedBudget).slice(0, rankWindow);
    }

    console.log(`[OppEngine v2] mode=${mode} skill=${skill} raw=${rawProfiles.length} gated=${gated.length} advanced=${advancedScoped.length} ranked=${ranked.length}`);

    if (!ranked.length) {
      const warning = cfg?.targetType === 'creator'
        ? 'No active small creators found with strong intent signals. Try a broader niche keyword or remove location.'
        : 'No quality leads found. Try a different location, skill, or broader prompt.';

      return res.status(200).json({
        leads: [],
        source: 'live',
        empty: true,
        warning,
      });
    }

    let leads = await enrichWithGroq({
      GROQ,
      profiles: ranked,
      skill,
      incomeGoal: leadTarget.incomeGoalUsd,
      cfg,
      leadLimit: leadTarget.requestedLeadCount,
      candidateLimit: leadTarget.planMaxCandidates,
    });
    if (isQuickMode) {
      leads = ensureQuickMinimumLeads(leads, ranked, skill, cfg, leadTarget.requestedLeadCount);
    }

    leads = attachOutreachAssets(leads, skill);

    const estimatedCredits = estimateScanCredits({
      isQuickMode,
      leadCount: leads.length,
      planTier,
      usedAi: Boolean(GROQ),
    });

    return res.status(200).json({
      leads,
      source: 'live',
      count: leads.length,
      targeting: {
        incomeGoalUsd: leadTarget.incomeGoalUsd,
        avgDealUsd: leadTarget.avgDealUsd,
        requestedLeadCount: leadTarget.requestedLeadCount,
        returnedLeadCount: leads.length,
      },
      usage: {
        planTier,
        estimatedCredits,
        billingModel: 'base + per-lead credits (plan-aware)',
      },
    });
  } catch (err) {
    console.error('Opportunity Engine fatal error:', err);
    return res.status(500).json({
      error: err?.message || 'Scan failed',
      leads: [],
      source: 'error',
    });
  }
}
