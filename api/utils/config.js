import { cleanText, clamp, lower, parseUsdNumber, parseUsdRange } from './text.js';

export const MARKETPLACE_BLOCKLIST = [
  'fiverr', 'upwork', 'freelancer', 'guru', 'toptal', '99designs',
  'canva', 'veed', 'template', 'theme', 'tool', 'software', 'platform',
  'list', 'top 10', 'best ', 'reddit', 'quora', 'agency', 'hubspot',
  'squarespace', 'wix', 'wordpress.org', 'clutch', 'goodfirms', 'bark.com',
  'thumbtack', 'sortlist',
];

export const GENERIC_PHRASES = [
  'improve online presence',
  'attract more clients',
  'grow business',
  'reach a wider audience',
  'help them succeed',
  'enhance visibility',
  'take your business to the next level',
];

export const PRICE_HINTS = {
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

export const PLAN_CONFIG = {
  free: {
    maxLeadCount: 8,
    maxCandidates: 18,
    baseQuickCredits: 1,
    baseDeepCredits: 3,
    perLeadCredits: 1,
    aiMultiplier: 1.1,
  },
  pro: {
    maxLeadCount: 25,
    maxCandidates: 60,
    baseQuickCredits: 1,
    baseDeepCredits: 2,
    perLeadCredits: 0.6,
    aiMultiplier: 1,
  },
};

export const SKILL_INTENT_RULES = {
  'Thumbnail Design': {
    requiredAny: ['thumbnail', 'ctr', 'click-through', 'packaging', 'title'],
    forbiddenAny: ['content calendar', 'retention strategy', 'bookkeeping', 'tax'],
    niche: 'creator-visuals',
    defaultStrategy: 'thumbnail-teardown',
  },
  'Video Editing': {
    requiredAny: ['editing', 'hook', 'retention', 'shorts', 'video'],
    forbiddenAny: ['bookkeeping', 'tax filing', 'seo audit only'],
    niche: 'creator-video',
    defaultStrategy: 'retention-sprint',
  },
  'Voice Over': {
    requiredAny: ['voice', 'narration', 'script read', 'audio'],
    forbiddenAny: ['thumbnail', 'tax filing', 'shopify design'],
    niche: 'creator-audio',
    defaultStrategy: 'voice-sample',
  },
  'Social Media Management': {
    requiredAny: ['social', 'posting', 'content', 'reels', 'engagement'],
    forbiddenAny: ['tax filing', 'bookkeeping', 'server migration'],
    niche: 'local-social',
    defaultStrategy: 'content-calendar',
  },
  'Web Design': {
    requiredAny: ['website', 'landing page', 'conversion', 'cta', 'design'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'local-web',
    defaultStrategy: 'conversion-audit',
  },
  'Copywriting': {
    requiredAny: ['copy', 'product description', 'ad copy', 'landing page'],
    forbiddenAny: ['bookkeeping', 'tax filing'],
    niche: 'ecom-copy',
    defaultStrategy: 'copy-teardown',
  },
  'Email Marketing': {
    requiredAny: ['email', 'sequence', 'list', 'campaign', 'newsletter'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'coach-email',
    defaultStrategy: 'sequence-map',
  },
  SEO: {
    requiredAny: ['seo', 'search', 'organic', 'ranking', 'traffic'],
    forbiddenAny: ['bookkeeping', 'tax filing'],
    niche: 'saas-seo',
    defaultStrategy: 'technical-seo-audit',
  },
  'Funnel Building': {
    requiredAny: ['funnel', 'lead', 'booking', 'conversion', 'pipeline'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'coach-funnel',
    defaultStrategy: 'booking-funnel-audit',
  },
  'Graphic Design': {
    requiredAny: ['design', 'creative', 'brand visuals', 'product creative'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'ecom-design',
    defaultStrategy: 'creative-sprint',
  },
  'Paid Ads': {
    requiredAny: ['ads', 'roas', 'campaign', 'conversion', 'meta ads'],
    forbiddenAny: ['tax filing', 'bookkeeping'],
    niche: 'ecom-ads',
    defaultStrategy: 'ad-angle-audit',
  },
  'Content Writing': {
    requiredAny: ['content', 'blog', 'article', 'case study', 'newsletter'],
    forbiddenAny: ['bookkeeping', 'tax filing'],
    niche: 'saas-content',
    defaultStrategy: 'content-gap-brief',
  },
};

export const SKILL_CONFIG = {
  'Thumbnail Design': {
    method: 'youtube',
    targetType: 'creator',
    ytQueries: ['finance youtube channel', 'productivity youtube channel', 'education youtube channel', 'faceless youtube channel', 'gaming youtube channel'],
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
    ytQueries: ['small youtube channel vlog', 'small youtube channel podcast', 'education youtube creator', 'faceless youtube channel', 'gaming youtube channel'],
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
    ytQueries: ['explainer youtube channel', 'history youtube channel', 'education youtube channel', 'documentary youtube channel'],
    minSubs: 2000,
    maxSubs: 70000,
    maxInactiveDays: 150,
    minAvgViews: 100,
    minViewSubRatio: 0.004,
    searchOrder: 'relevance',
    publishedAfterDays: 300,
    minLeadCount: 3,
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
  },
  Copywriting: {
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
  SEO: {
    method: 'serp',
    targetType: 'business',
    serpQuery: '(small business website OR local business website OR ecommerce store) (slow website OR weak SEO OR not ranking OR low traffic) -agency -"seo services"',
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
    serpQuery: '(saas website OR startup website OR ecommerce brand) (blog OR resources OR knowledge base) -"content writing services" -agency',
    allowDomains: [],
    exclude: ['fiverr', 'upwork', 'agency', 'copywriting agency', 'content writing services', 'jasper', 'copy.ai', 'list', 'top 10', 'producthunt.com'],
  },
};

export function getSkillConfig(skill) {
  return SKILL_CONFIG[skill] || null;
}

export function getPriceHint(skill) {
  return PRICE_HINTS[skill] || PRICE_HINTS.default;
}

export function resolvePlanTier(body = {}) {
  const raw = lower(body.plan || body.planTier || body.subscription || body.userPlan || 'free');
  if (raw.includes('pro') || raw.includes('plus') || raw.includes('go') || raw.includes('premium')) return 'pro';
  return 'free';
}

export function computeLeadTarget({ incomeGoal, skill, planTier }) {
  const plan = PLAN_CONFIG[planTier] || PLAN_CONFIG.free;
  const incomeGoalUsd = clamp(Math.round(parseUsdNumber(incomeGoal) || 500), 100, 10000);
  const deal = parseUsdRange(getPriceHint(skill));
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

export function estimateScanCredits({ isQuickMode, leadCount, planTier, usedAi }) {
  const plan = PLAN_CONFIG[planTier] || PLAN_CONFIG.free;
  const base = isQuickMode ? plan.baseQuickCredits : plan.baseDeepCredits;
  const raw = base + (Number(leadCount || 0) * plan.perLeadCredits);
  return Math.max(1, Math.ceil(usedAi ? raw * plan.aiMultiplier : raw));
}

export function isBlockedMarketplace(text) {
  const value = lower(text);
  return MARKETPLACE_BLOCKLIST.some((keyword) => value.includes(keyword));
}

export function getNicheForSkill(skill, platform = '') {
  const rule = SKILL_INTENT_RULES[skill];
  if (rule?.niche) return rule.niche;
  if (platform === 'YouTube') return 'creator';
  if (platform === 'Google Maps') return 'local-business';
  if (platform === 'LinkedIn') return 'linkedin';
  if (platform === 'Shopify') return 'shopify';
  if (platform === 'Product Hunt') return 'saas';
  return 'web';
}

export function getDefaultStrategy(skill) {
  return SKILL_INTENT_RULES[skill]?.defaultStrategy || 'specific-audit';
}

export function hasGenericPhrase(text) {
  const value = lower(text);
  return GENERIC_PHRASES.some((phrase) => value.includes(phrase));
}
