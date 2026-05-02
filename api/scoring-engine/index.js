import {
  getDefaultStrategy,
  getNicheForSkill,
  isBlockedMarketplace,
  SKILL_INTENT_RULES,
} from '../utils/config.js';
import { cleanText, clamp, getRootDomain, lower, uniqueBy } from '../utils/text.js';

const SERVICE_RULES = {
  thumbnails: ['thumbnail', 'ctr', 'title', 'packaging', 'youtube'],
  copywriting: ['copy', 'sales page', 'product description', 'ad copy', 'landing page'],
  funnel: ['funnel', 'lead', 'booking', 'pipeline', 'conversion', 'cta'],
  'social-media': ['social', 'instagram', 'tiktok', 'reels', 'posting', 'engagement'],
  email: ['email', 'newsletter', 'sequence', 'klaviyo', 'mailchimp', 'list'],
  seo: ['seo', 'organic', 'ranking', 'traffic', 'search'],
  ads: ['ads', 'roas', 'campaign', 'meta ads', 'google ads'],
};

const SKILL_TO_SERVICE = {
  'Thumbnail Design': 'thumbnails',
  'Video Editing': 'thumbnails',
  Copywriting: 'copywriting',
  'Funnel Building': 'funnel',
  'Social Media Management': 'social-media',
  'Email Marketing': 'email',
  SEO: 'seo',
  'Paid Ads': 'ads',
};

function scoreCreatorProfile(profile, config, contactScore = 0, intentScore = 60, learning = {}) {
  const subs = Number(profile.subscriberCount || 0);
  const ratio = Number(profile.viewSubRatio || 0);
  const lastUploadDays = Number(profile.lastUploadDays || 999);
  const avgViews = Number(profile.avgRecentViews || 0);

  const sizeFit = subs >= Number(config?.minSubs || 0) && subs <= Number(config?.maxSubs || 1000000) ? 100
    : subs < Number(config?.minSubs || 0) ? 35 : 45;
  const activity = lastUploadDays <= 7 ? 100
    : lastUploadDays <= 14 ? 92
    : lastUploadDays <= 30 ? 78
    : lastUploadDays <= 60 ? 58
    : lastUploadDays <= 120 ? 35 : 15;
  const engagement = ratio >= 0.12 ? 100
    : ratio >= 0.07 ? 84
    : ratio >= 0.04 ? 68
    : ratio >= 0.02 ? 50 : 25;
  const demand = avgViews >= 5000 ? 92
    : avgViews >= 1500 ? 74
    : avgViews >= 700 ? 60
    : avgViews >= 250 ? 45 : 25;
  const offerFit = subs <= 50000 ? 88 : subs <= 100000 ? 72 : 52;

  const weights = {
    intent: 0.24,
    activity: 0.19,
    engagement: 0.18,
    demand: 0.15,
    sizeFit: 0.12,
    contactability: 0.08,
    offerFit: 0.04,
    ...(learning?.weights?.creator || {}),
  };

  const score = (weights.intent * intentScore)
    + (weights.activity * activity)
    + (weights.engagement * engagement)
    + (weights.demand * demand)
    + (weights.sizeFit * sizeFit)
    + (weights.contactability * contactScore)
    + (weights.offerFit * offerFit);

  return {
    qualityScore: clamp(Math.round(score + Number(learning?.scoreBoost || 0)), 45, 99),
    scoreBreakdown: {
      channel: 'creator',
      intent: Math.round(intentScore),
      activity: Math.round(activity),
      engagement: Math.round(engagement),
      demand: Math.round(demand),
      sizeFit: Math.round(sizeFit),
      contactability: Math.round(contactScore),
      offerFit: Math.round(offerFit),
      learningBoost: Number(learning?.scoreBoost || 0),
    },
  };
}

function scoreMapsProfile(profile, contactScore = 0, intentScore = 60, learning = {}) {
  const reviews = Number(profile.reviews || 0);
  const rating = Number(profile.rating || 0);
  const trust = rating >= 4.6 ? 95 : rating >= 4.2 ? 80 : rating >= 3.8 ? 65 : 42;
  const demand = reviews >= 200 ? 96 : reviews >= 70 ? 82 : reviews >= 20 ? 64 : 38;
  const listingCompleteness = profile.websiteUrl && profile.phone ? 95 : profile.websiteUrl || profile.phone ? 76 : 45;
  const weights = {
    intent: 0.26,
    trust: 0.18,
    demand: 0.19,
    listingCompleteness: 0.12,
    contactability: 0.17,
    offerFit: 0.08,
    ...(learning?.weights?.maps || {}),
  };
  const offerFit = 74;
  const score = (weights.intent * intentScore)
    + (weights.trust * trust)
    + (weights.demand * demand)
    + (weights.listingCompleteness * listingCompleteness)
    + (weights.contactability * contactScore)
    + (weights.offerFit * offerFit);

  return {
    qualityScore: clamp(Math.round(score + Number(learning?.scoreBoost || 0)), 45, 98),
    scoreBreakdown: {
      channel: 'maps',
      intent: Math.round(intentScore),
      trust: Math.round(trust),
      demand: Math.round(demand),
      listingCompleteness: Math.round(listingCompleteness),
      contactability: Math.round(contactScore),
      offerFit,
      learningBoost: Number(learning?.scoreBoost || 0),
    },
  };
}

function scoreWebProfile(profile, config, contactScore = 0, intentScore = 60, learning = {}) {
  const text = lower(`${profile.name} ${profile.description} ${profile.profileUrl}`);
  const trustedDomain = (config?.allowDomains || []).some((domain) => lower(profile.profileUrl).includes(lower(domain)));
  const monetizationHits = ['pricing', 'shop', 'store', 'book', 'buy', 'course', 'membership', 'consult'].filter((token) => text.includes(token)).length;
  const domainQuality = trustedDomain ? 92 : 62;
  const monetization = clamp(45 + (monetizationHits * 12), 40, 96);
  const freshness = 70;
  const offerFit = trustedDomain ? 86 : 68;
  const weights = {
    intent: 0.29,
    domainQuality: 0.18,
    monetization: 0.17,
    contactability: 0.18,
    offerFit: 0.10,
    freshness: 0.08,
    ...(learning?.weights?.web || {}),
  };
  const score = (weights.intent * intentScore)
    + (weights.domainQuality * domainQuality)
    + (weights.monetization * monetization)
    + (weights.contactability * contactScore)
    + (weights.offerFit * offerFit)
    + (weights.freshness * freshness);

  return {
    qualityScore: clamp(Math.round(score + Number(learning?.scoreBoost || 0)), 45, 98),
    scoreBreakdown: {
      channel: 'web',
      intent: Math.round(intentScore),
      domainQuality,
      monetization,
      contactability: Math.round(contactScore),
      offerFit,
      freshness,
      learningBoost: Number(learning?.scoreBoost || 0),
    },
  };
}

export function inferPainScore(profile, config, intent = null) {
  let pain = 55;
  const isCreator = config?.targetType === 'creator' || profile.platform === 'YouTube';

  if (isCreator) {
    const lastUploadDays = Number(profile.lastUploadDays || 999);
    const ratio = Number(profile.viewSubRatio || 0);
    const views = Number(profile.avgRecentViews || 0);
    if (lastUploadDays <= 7) pain += 13;
    else if (lastUploadDays <= 30) pain += 7;
    if (ratio < 0.03) pain += 17;
    else if (ratio < 0.06) pain += 10;
    if (views < 800) pain += 9;
    if (!lower(profile.description).match(/patreon|sponsor|affiliate|course|shop|membership/)) pain += 6;
  } else {
    const text = lower(`${profile.description} ${profile.profileUrl}`);
    if (!text.includes('pricing')) pain += 8;
    if (!text.includes('book') && !text.includes('schedule')) pain += 9;
    if (!text.includes('testimonial') && !text.includes('case stud')) pain += 7;
    if (!profile.websiteUrl && !profile.phone) pain += 8;
    if (Number(profile.rating || 0) > 0 && Number(profile.rating || 0) < 4.2) pain += 5;
  }

  if (intent?.urgency) pain += Math.round((Number(intent.urgency) - 50) / 10);
  return clamp(Math.round(pain), 40, 99);
}

export function qualityGate(profiles, config) {
  return (profiles || []).filter((profile) => {
    if (!profile?.name || !profile?.profileUrl) return false;
    if (!profile.profileUrl.startsWith('http')) return false;
    if (isBlockedMarketplace(`${profile.name} ${profile.description} ${profile.profileUrl}`)) return false;

    if (config?.targetType === 'creator' || profile.platform === 'YouTube') {
      if (profile.platform !== 'YouTube') return false;
      if (!Number.isFinite(Number(profile.subscriberCount))) return false;
      if (Number(profile.subscriberCount) < Number(config?.minSubs || 0)) return false;
      if (Number(profile.subscriberCount) > Number(config?.maxSubs || 1_000_000)) return false;
      if (Number(profile.lastUploadDays || 999) > Number(config?.maxInactiveDays || 180)) return false;
      if (Number(profile.avgRecentViews || 0) < Number(config?.minAvgViews || 60)) return false;
      if (Number(profile.viewSubRatio || 0) < Number(config?.minViewSubRatio || 0.002)) return false;
    }

    return true;
  });
}

function quickRecoveryGate(profiles, config) {
  return (profiles || []).filter((profile) => {
    if (!profile?.name || !profile?.profileUrl || isBlockedMarketplace(`${profile.name} ${profile.profileUrl}`)) return false;
    if (config?.targetType === 'creator' || profile.platform === 'YouTube') {
      return profile.platform === 'YouTube'
        && Number(profile.subscriberCount || 0) >= Math.max(300, Number(config?.minSubs || 1000) * 0.35)
        && Number(profile.lastUploadDays || 999) <= Math.max(240, Number(config?.maxInactiveDays || 120) * 1.6);
    }
    return true;
  });
}

export function buildCandidatePool(profiles, config, isQuickMode = true) {
  const base = uniqueBy(profiles || [], (profile) => profile.profileUrl || profile.sourceId);
  const strict = qualityGate(base, config);
  if (!isQuickMode || strict.length >= 3) return strict;
  return uniqueBy([...strict, ...quickRecoveryGate(base, config)], (profile) => profile.profileUrl || profile.sourceId);
}

export function normalizeAdvancedControls(body = {}) {
  const filters = Array.isArray(body.filters) ? body.filters : [body.filters].filter(Boolean);
  const serviceRaw = body.serviceMatch ?? body.serviceNeed ?? body.service ?? body.services ?? [];
  const services = Array.isArray(serviceRaw) ? serviceRaw : [serviceRaw].filter(Boolean);
  const filterText = filters.map(lower).join(' ');

  return {
    audienceBucket: lower(body.audienceSize ?? body.audience ?? body.audienceBucket ?? 'all') || 'all',
    serviceFilters: services.map((service) => lower(service).replace(/\s+/g, '-')).filter((service) => service !== 'all'),
    hotLeadsOnly: body.hotLeadsOnly === true || lower(body.hotLeadsOnly).includes('hot'),
    filterHighPain: filterText.includes('high pain') || filterText.includes('pain>90') || filterText.includes('pain >90'),
    filterActive7d: filterText.includes('active') && filterText.includes('7'),
    filterNoMonetization: filterText.includes('no monetization'),
  };
}

function detectServiceTags(profile, skill) {
  const text = lower(`${profile.name || ''} ${profile.description || ''} ${profile.platform || ''}`);
  const tags = new Set();
  for (const [tag, keywords] of Object.entries(SERVICE_RULES)) {
    if (keywords.some((keyword) => text.includes(keyword))) tags.add(tag);
  }
  const skillTag = SKILL_TO_SERVICE[skill];
  if (skillTag) tags.add(skillTag);
  if (profile.platform === 'YouTube') tags.add('thumbnails');
  if (profile.platform === 'LinkedIn') {
    tags.add('copywriting');
    tags.add('email');
  }
  return [...tags];
}

function audiencePass(profile, config, bucket) {
  if (!bucket || bucket === 'all') return true;
  const isCreator = config?.targetType === 'creator' || profile.platform === 'YouTube';
  if (isCreator) {
    const subs = Number(profile.subscriberCount || 0);
    if (!subs) return true;
    if (bucket === 'beginner') return subs < 10000;
    if (bucket === 'growing') return subs >= 10000 && subs <= 50000;
    if (bucket === 'established') return subs > 50000;
    return true;
  }
  const reviews = Number(profile.reviews || 0);
  if (!reviews) return true;
  if (bucket === 'beginner') return reviews < 30;
  if (bucket === 'growing') return reviews >= 30 && reviews <= 150;
  if (bucket === 'established') return reviews > 150;
  return true;
}

function hasMonetizationSignal(profile) {
  return lower(`${profile.description} ${profile.profileUrl}`).match(/patreon|sponsor|affiliate|course|shop|store|pricing|book|consult|membership|buy/);
}

export function applyAdvancedProfileFilters(profiles, config, advanced = {}, skill = null) {
  const isCreator = config?.targetType === 'creator';
  return (profiles || []).filter((profile) => {
    const painScore = inferPainScore(profile, config);
    const serviceTags = detectServiceTags(profile, skill);
    profile.painScore = painScore;
    profile.serviceTags = serviceTags;

    if (!audiencePass(profile, config, advanced.audienceBucket)) return false;
    if (advanced.serviceFilters?.length && !advanced.serviceFilters.some((service) => serviceTags.includes(service))) return false;
    if (advanced.hotLeadsOnly && (Number(profile.qualityScore || profile.discoveryScore || 0) < 70 || painScore < 72)) return false;
    if (advanced.filterHighPain && painScore < 90) return false;
    if (advanced.filterActive7d && (isCreator || profile.platform === 'YouTube') && Number(profile.lastUploadDays || 999) > 7) return false;
    if (advanced.filterNoMonetization && hasMonetizationSignal(profile)) return false;
    return true;
  });
}

export function scoreProfiles({
  profiles,
  config,
  skill,
  intentsById = new Map(),
  contactsById = new Map(),
  learningAdjustments = {},
  signals = [],
  budget = [],
}) {
  const signalSet = new Set((signals || []).map(lower));
  const budgetSet = new Set((budget || []).map(lower));

  return (profiles || []).map((profile) => {
    const intent = intentsById.get(profile.sourceId) || {};
    const contact = contactsById.get(profile.sourceId) || profile.contactInfo || {};
    const contactScore = Number(contact.availabilityScore || 35);
    const intentScore = Number(intent.intentScore || profile.discoveryScore || 60);
    const learning = learningAdjustments || {};
    let scored;

    if (config?.targetType === 'creator' || profile.platform === 'YouTube') {
      scored = scoreCreatorProfile(profile, config, contactScore, intentScore, learning);
      if (signalSet.has('active-posting') && Number(profile.lastUploadDays || 999) <= 14) scored.qualityScore += 3;
      if (signalSet.has('high-engagement') && Number(profile.viewSubRatio || 0) >= 0.07) scored.qualityScore += 4;
      if (budgetSet.has('low-ticket') && Number(profile.subscriberCount || 0) <= 30000) scored.qualityScore += 2;
    } else if (profile.platform === 'Google Maps') {
      scored = scoreMapsProfile(profile, contactScore, intentScore, learning);
      if (signalSet.has('high-intent') && (profile.websiteUrl || profile.phone)) scored.qualityScore += 4;
      if (budgetSet.has('mid-ticket') && Number(profile.reviews || 0) >= 50) scored.qualityScore += 3;
    } else {
      scored = scoreWebProfile(profile, config, contactScore, intentScore, learning);
      if (signalSet.has('high-intent') && profile.profileUrl) scored.qualityScore += 3;
      if (budgetSet.has('mid-ticket')) scored.qualityScore += 2;
    }

    const painScore = intent.painScore || inferPainScore(profile, config, intent);
    return {
      ...profile,
      contactInfo: contact,
      intent,
      painScore: clamp(painScore, 40, 99),
      qualityScore: clamp(scored.qualityScore, 40, 99),
      scoreBreakdown: scored.scoreBreakdown,
      strategyKey: learning.suggestedStrategy || getDefaultStrategy(skill),
      niche: getNicheForSkill(skill, profile.platform),
      nichePriorityScore: Number(learning.nichePriorityScore || 1),
      locationBoost: Number(profile.locationBoost || 1),
      memoryPriorityScore: Number(profile.memoryPriorityScore || 1),
    };
  }).sort((a, b) => {
    const left = Number(b.qualityScore || 0)
      * Number(b.nichePriorityScore || 1)
      * Number(b.locationBoost || 1)
      * Number(b.memoryPriorityScore || 1);
    const right = Number(a.qualityScore || 0)
      * Number(a.nichePriorityScore || 1)
      * Number(a.locationBoost || 1)
      * Number(a.memoryPriorityScore || 1);
    return left - right;
  });
}

export function pickDiverseTopLeads(leads, maxLeads = 3, skill = null) {
  const selected = [];
  const usedDomains = new Set();
  const usedBuckets = new Set();
  const ranked = [...(leads || [])].sort((a, b) => {
    const left = (
      (Number(b.intent?.intentScore || b.intentScore || 0) * 0.35)
      + (Number(b.qualityScore || 0) * 0.30)
      + (Number(b.replyProbability || 0) * 0.20)
      + (Number(b.dealProbability || 0) * 0.15)
    )
      * Number(b.nichePriorityScore || 1)
      * Number(b.locationBoost || 1)
      * Number(b.memoryPriorityScore || 1);
    const right = (
      (Number(a.intent?.intentScore || a.intentScore || 0) * 0.35)
      + (Number(a.qualityScore || 0) * 0.30)
      + (Number(a.replyProbability || 0) * 0.20)
      + (Number(a.dealProbability || 0) * 0.15)
    )
      * Number(a.nichePriorityScore || 1)
      * Number(a.locationBoost || 1)
      * Number(a.memoryPriorityScore || 1);
    return left - right;
  });

  for (const lead of ranked) {
    if (selected.length >= maxLeads) break;
    const domain = getRootDomain(lead.profileUrl);
    const bucket = lead.niche || getNicheForSkill(skill, lead.platform);
    if (domain && usedDomains.has(domain)) continue;
    if (usedBuckets.has(bucket) && selected.length < Math.ceil(maxLeads / 2)) continue;
    selected.push(lead);
    if (domain) usedDomains.add(domain);
    if (bucket) usedBuckets.add(bucket);
  }

  for (const lead of ranked) {
    if (selected.length >= maxLeads) break;
    if (!selected.some((item) => item.sourceId === lead.sourceId)) selected.push(lead);
  }

  return selected.slice(0, maxLeads);
}

export function buildFallbackInsight(profile, skill, config) {
  const rule = SKILL_INTENT_RULES[skill] || {};
  const keyword = rule.requiredAny?.[0] || 'conversion';
  if (config?.targetType === 'creator' || profile.platform === 'YouTube') {
    return {
      problem: `${profile.name} has active uploads and recent view data that suggests ${keyword} upside on the next few releases.`,
      strategy: `Lead with a short teardown of one recent upload, then offer a focused ${keyword} sprint with measurable before and after signals.`,
      whyNow: Number(profile.lastUploadDays || 999) <= 14
        ? 'They posted recently, so a timely teardown can connect to work already on their mind.'
        : 'They have enough recent activity to make a small performance test credible.',
    };
  }
  return {
    problem: `${profile.name} shows visible demand signals, but the current path to inquiry likely has a ${keyword} gap.`,
    strategy: `Lead with one concrete page or offer fix, then pitch a low-risk starter implementation tied to ${keyword}.`,
    whyNow: 'The business is discoverable right now, so improving conversion can compound existing traffic instead of waiting for new demand.',
  };
}
