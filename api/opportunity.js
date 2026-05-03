// api/opportunity.js
// Opportunity Engine v2
// Goal: high-intent leads only (especially small creators for creator skills)

const DAY_MS = 24 * 60 * 60 * 1000;

const MARKETPLACE_BLOCKLIST = [
  'fiverr', 'upwork', 'freelancer', 'guru', 'toptal', '99designs',
  'canva', 'veed', 'template', 'theme', 'tool', 'software', 'platform',
  'list', 'top 10', 'best ', 'reddit', 'quora', 'agency',
  'hubspot', 'squarespace', 'wix', 'wordpress.org',
  'clutch', 'goodfirms', 'bark.com', 'thumbtack', 'sortlist',
  'how to grow', 'youtube tips', 'get more views', 'youtube automation',
  'make money online', 'passive income', 'side hustle', 'faceless channel'
];

const LOCATION_TO_REGION = {
  'united states': 'US', 'usa': 'US', 'us': 'US',
  'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB',
  'india': 'IN', 'canada': 'CA', 'australia': 'AU',
  'germany': 'DE', 'france': 'FR', 'brazil': 'BR',
  'pakistan': 'PK', 'nigeria': 'NG', 'philippines': 'PH',
  'south africa': 'ZA', 'kenya': 'KE', 'ghana': 'GH',
};

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

function withTimeout(promise, ms = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`API call timed out after ${ms}ms`)), ms)
    )
  ]);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function normalizeDealValue(raw, fallback = PRICE_HINTS.default) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;

  const rangeMatch = text.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:-|–|—|to)\s*\$?\s*([\d,]+(?:\.\d+)?)(.*)$/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1].replace(/,/g, ''));
    const max = Number(rangeMatch[2].replace(/,/g, ''));
    const suffix = (rangeMatch[3] || '').trim();
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return `$${min.toLocaleString('en-US')} - $${max.toLocaleString('en-US')}${suffix ? ` ${suffix}` : ''}`;
    }
  }

  const commaOnly = text.match(/^\$?\s*(\d{2,4})\s*,\s*(\d{2,4})(.*)$/);
  if (commaOnly) {
    const left = Number(commaOnly[1]);
    const right = Number(commaOnly[2]);
    const suffix = (commaOnly[3] || '').trim();
    if (left >= 50 && right >= left && right <= 5000) {
      return `$${left.toLocaleString('en-US')} - $${right.toLocaleString('en-US')}${suffix ? ` ${suffix}` : ''}`;
    }
  }

  return text.replace(/\s*(?:–|—)\s*/g, ' - ');
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

let INTERNAL_API_BASE = '';

function resolveInternalApiBase(req) {
  const proto = cleanText(req?.headers?.['x-forwarded-proto'] || '').split(',')[0];
  const host = cleanText(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0];
  if (proto && host) return `${proto}://${host}`;
  if (host) return `https://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

function internalApiUrl(path) {
  return new URL(path, INTERNAL_API_BASE || resolveInternalApiBase()).toString();
}

function buildOutreachAssets(lead, skill) {
  const name = cleanText(lead?.name || 'there');
  const problem = cleanText(lead?.problem || `I found a clear ${skill || 'growth'} gap`);
  const strategy = cleanText(lead?.strategy || 'I can share a quick fix plan and implement fast.');
  const deal = normalizeDealValue(cleanText(lead?.dealValue || PRICE_HINTS[skill] || PRICE_HINTS.default), PRICE_HINTS[skill] || PRICE_HINTS.default);
  const profileUrl = cleanText(lead?.profileUrl || '');
  const whyNow = cleanText(lead?.whyNow || 'there is active growth momentum, so a small fix can move fast');
  const closingHint = cleanText(lead?.closingHint || 'Start with a tiny first deliverable to reduce risk.');
  const nameHash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const isBusinessLead = lower(lead?.platform) !== 'youtube';

  const variants = [
    [
      `Hey ${name} -`,
      `watched a few of your recent videos. ${problem}`,
      `curious if that's something you're actively trying to fix or just riding out?`,
    ],
    [
      `Hey ${name},`,
      `been looking at your channel - the content itself is solid.`,
      `one thing I'd change: ${strategy}`,
      `could be worth a quick chat if you're open to it.`,
    ],
    [
      `${name} -`,
      `noticed ${problem}`,
      `had an idea for a fix that'd probably take less than a week.`,
      `want me to send a quick breakdown?`,
    ],
    [
      `Hey ${name},`,
      `came across your business - ${problem}`,
      `I do this exact fix for similar businesses. want me to show you what it'd look like for yours?`,
    ],
  ];
  const variantIndex = isBusinessLead ? (nameHash % 2 === 0 ? 3 : 2) : nameHash % 3;
  const quickDm = variants[variantIndex].join('\n');
  const subjectVariants = [
    `had an idea for ${name}`,
    `quick thing I noticed on your channel`,
    `one change that could move things for you`,
    `${name} - saw something worth sharing`,
  ];
  const subject = subjectVariants[nameHash % subjectVariants.length];

  const loomScript = [
    `Hi ${name}, quick teardown for your ${lead?.platform || 'business'}.`,
    `1) What I noticed: ${problem}`,
    `2) Why it matters now: ${whyNow}`,
    `3) What I would do first: ${strategy}`,
    `4) What I'd do first: ${strategy} - I can have something ready this week (${deal}).`,
  ].join('\n');

  const audit = [
    `Lead: ${name}`,
    `URL: ${profileUrl || 'N/A'}`,
    `Skill: ${skill || 'General'}`,
    `Main gap: ${problem}`,
    `First fix: ${strategy}`,
    `Offer range: ${deal}`,
    `Reply angle: ${closingHint}`,
  ].join('\n');

  const proposal = [
    `Subject: ${subject}`,
    ``,
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

async function callInternalWriter(path, payload) {
  const data = await fetchJson(
    internalApiUrl(path),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    12000
  );

  if (data?.error) throw new Error(data.error);
  return data;
}

async function buildOutreachAssetsAI(lead, skill) {
  const fallback = buildOutreachAssets(lead, skill);
  const name = cleanText(lead?.name || 'there');
  const deal = normalizeDealValue(cleanText(lead?.dealValue || PRICE_HINTS[skill] || PRICE_HINTS.default), PRICE_HINTS[skill] || PRICE_HINTS.default);
  const profileUrl = cleanText(lead?.profileUrl || '');
  const tipsFallback = cleanText(lead?.closingHint || 'Offer a tiny first deliverable to reduce risk.');

  try {
    const [proposalData, emailData] = await Promise.all([
      callInternalWriter('/api/proposal', {
        jobDesc: `${lead.name} runs a ${lead.platform} channel. Problem: ${lead.problem}. Why now: ${lead.whyNow}. Strategy: ${lead.strategy}.`,
        platform: lead.platform || 'general',
        niche: skill,
        experience: lead.strategy
      }),
      callInternalWriter('/api/email', {
        emailType: 'Cold outreach with a specific insight',
        tone: 'calm and confident',
        context: `Client: ${lead.name}. Problem: ${lead.problem}. Why now: ${lead.whyNow}. Offer: ${lead.dealValue}.`,
        niche: skill
      }),
    ]);

    if (!proposalData?.proposal || !emailData?.body) {
      throw new Error('Missing writer output');
    }

    const quickDm = String(emailData.body || fallback.quickDm).trim();
    const proposal = String(proposalData.proposal || fallback.proposal).trim();
    const loomScript = [
      `Quick teardown for ${name}.`,
      `What I noticed: ${cleanText(lead?.problem || '')}`,
      `Why now: ${cleanText(lead?.whyNow || '')}`,
      proposal,
      `Starter offer: ${deal}.`,
    ].filter(Boolean).join('\n');
    const audit = [
      `Lead: ${name}`,
      `URL: ${profileUrl || 'N/A'}`,
      `Skill: ${skill || 'General'}`,
      `Email subject: ${cleanText(emailData.subject || '') || 'N/A'}`,
      `Quick DM: ${quickDm}`,
      `Proposal angle: ${proposal}`,
      `Reply cues: ${(Array.isArray(emailData.tips) ? emailData.tips : []).map((tip) => cleanText(tip)).filter(Boolean).join(' | ') || tipsFallback}`,
    ].join('\n');

    return { quickDm, loomScript, audit, proposal };
  } catch (e) {
    console.warn('AI outreach asset generation failed, using fallback:', e.message || e);
    return fallback;
  }
}

async function attachOutreachAssets(leads, skill) {
  return Promise.all((leads || []).map(async (lead) => {
    const assets = await buildOutreachAssetsAI(lead, skill);
    return {
      ...lead,
      assets,
      quickDm: assets.quickDm,
      loomScript: assets.loomScript,
      audit: assets.audit,
      proposal: assets.proposal,
    };
  }));
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

const SKILL_FALLBACK_TEXT = {
  'Thumbnail Design': {
    problem: (name) => `${name} is uploading actively but their thumbnails likely have low CTR - a quick redesign sprint could unlock more views.`,
    strategy: () => `Pitch a 3-thumbnail test sprint and show a before/after CTR improvement example.`,
  },
  'Video Editing': {
    problem: (name) => `${name} uploads regularly but their editing pacing and hooks likely lose viewers in the first 30 seconds.`,
    strategy: () => `Offer a free 60-second re-edit of their worst-performing video as a proof-of-concept.`,
  },
  'Voice Over': {
    problem: (name) => `${name} posts narration-heavy content but their audio quality or pacing likely reduces watch time.`,
    strategy: () => `Offer a sample re-narration of one of their recent videos to demonstrate the quality gap.`,
  },
  'Social Media Management': {
    problem: (name) => `${name} has visible demand but posts inconsistently, leaving engagement on the table.`,
    strategy: () => `Propose a 30-day content calendar with 3 posts per week as a starter package.`,
  },
  'Web Design': {
    problem: (name) => `${name} has traffic but their website likely has a weak CTA and poor mobile experience hurting conversions.`,
    strategy: () => `Offer a free homepage audit with 3 specific conversion fixes as a discovery call hook.`,
  },
  'Copywriting': {
    problem: (name) => `${name} has a product but their copy likely undersells the value proposition and has no clear hook.`,
    strategy: () => `Rewrite their hero section headline for free and show the contrast to open the conversation.`,
  },
  'Email Marketing': {
    problem: (name) => `${name} has an audience but no email sequence to convert followers into paying customers.`,
    strategy: () => `Offer to write a 3-email welcome sequence as a low-risk starter deliverable.`,
  },
  'SEO': {
    problem: (name) => `${name} has a website but is likely invisible on Google due to missing on-page SEO basics.`,
    strategy: () => `Run a free keyword gap audit and present 5 quick wins they can implement immediately.`,
  },
  'Funnel Building': {
    problem: (name) => `${name} drives traffic but has no funnel to capture leads or convert visitors into clients.`,
    strategy: () => `Propose a simple 3-step lead magnet funnel as a starter build.`,
  },
  'Graphic Design': {
    problem: (name) => `${name} sells products but their visual branding is inconsistent and likely hurts perceived value.`,
    strategy: () => `Create a free brand style tile (colors, fonts, sample creative) to demonstrate the upgrade.`,
  },
  'Paid Ads': {
    problem: (name) => `${name} has a product but is likely leaving money on the table with no structured paid acquisition.`,
    strategy: () => `Propose a $5/day test campaign with one ad creative to prove ROI before a bigger commitment.`,
  },
  'Content Writing': {
    problem: (name) => `${name} has a website but their blog is thin or outdated, missing organic search traffic.`,
    strategy: () => `Offer one free SEO-optimized article on their top keyword to show the content quality gap.`,
  },
};

const EDUCATIONAL_VIDEO_PATTERNS = [
  /how to (make|create|design|edit|grow|get|improve|increase|boost)/i,
  /\d+ (tips|ways|secrets|hacks|mistakes|steps|tricks)/i,
  /(tutorial|guide|course|lesson|training|explained|masterclass)/i,
  /(beginner|for beginners|complete guide|step by step|from scratch)/i,
  /(you need to|you should|you must|stop doing|avoid these)/i,
  /(best way to|how i|my secret|the truth about)/i,
  /(make money|earn money|passive income|side hustle|dropshipping)/i,
  /(affiliate marketing|amazon fba|shopify tutorial|crypto)/i,
  /(youtube algorithm|go viral|get more|grow your|increase your)/i,
  /(monetize|faceless channel|automation|content strategy)/i,
];

const EDUCATIONAL_RED_FLAG_PHRASES = [
  'how to', 'tutorial', 'tips', 'secrets', 'mistakes',
  'beginner guide', 'make money', 'passive income',
  'get more', 'grow your', 'increase your',
];

const EMERGENCY_FALLBACK_QUERIES = {
  'Thumbnail Design': [
    'daily vlog', 'gaming channel', 'cooking videos',
    'travel diary', 'fitness journey', 'podcast clips',
  ],
  'Video Editing': [
    'personal vlog', 'travel videos', 'workout videos',
    'recipe videos', 'story time', 'reaction videos',
  ],
  'Voice Over': [
    'documentary', 'story narration', 'educational video',
    'history channel', 'true crime', 'mystery videos',
  ],
  'Social Media Management': ['local restaurant social media', 'salon instagram business', 'gym fitness studio social'],
  'Web Design': ['local dentist website', 'plumber contractor website', 'clinic small business website'],
  'SEO': [
    'local plumber website',
    'dentist clinic website',
    'hair salon small business',
    'local gym fitness center website',
    'local restaurant website',
    'accountant small business website',
  ],
  'Funnel Building': [
    'fitness coach online program',
    'life coach digital course',
    'business coach mentorship program',
    'nutrition coach meal plan',
    'mindset coach online course',
    'weight loss coach program',
  ],
  'Email Marketing': [
    'fitness supplements shopify store',
    'wellness brand online store',
    'beauty skincare shopify',
    'yoga studio online products',
    'nutrition coach online store',
    'activewear clothing shopify',
  ],
  'Copywriting': ['shopify clothing store', 'beauty brand shopify', 'fitness supplements store'],
  'Paid Ads': ['shopify ecommerce fashion store', 'beauty brand paid ads', 'fitness supplement brand'],
  'Graphic Design': ['shopify clothing accessories store', 'beauty brand shopify design', 'ecommerce brand visual'],
  'Content Writing': [
    'fitness brand blog articles',
    'beauty brand shopify blog',
    'lifestyle brand content writing',
    'food brand recipe blog',
    'wellness brand blog posts',
    'ecommerce brand product blog',
  ],
};

const GENERIC_PHRASES = [
  'improve online presence',
  'attract more clients',
  'grow business',
  'reach a wider audience',
  'help them succeed',
  'enhance visibility',
];

function hasGenericPhrase(text = '') {
  const value = lower(text);
  return GENERIC_PHRASES.some((phrase) => value.includes(phrase));
}

async function rewriteGenericField({ GROQ, value }) {
  const raw = cleanText(value);
  if (!raw || !GROQ || !hasGenericPhrase(raw)) return raw;

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
          max_tokens: 80,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: `Rewrite this in one specific, non-generic sentence: ${raw}. Return {"sentence":"..."} only.`,
            },
          ],
        }),
      },
      10000
    );

    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    return cleanText(parsed?.sentence || raw);
  } catch (e) {
    console.warn('Generic field rewrite failed:', e.message || e);
    return raw;
  }
}

const SKILL_CONFIG = {
  'Thumbnail Design': {
    method: 'youtube',
    targetType: 'creator',
    ytQueries: [
      'my stock portfolio update',
      'what i eat in a day realistic',
      'i tried this workout challenge',
      'travel vlog solo backpacking',
      'minecraft survival lets play',
      'my morning routine 2024',
      'day in my life college student',
      'cooking easy recipes quick',
    ],
    minSubs: 2000,
    maxSubs: 10000,
    maxInactiveDays: 120,
    minAvgViews: 100,
    minViewSubRatio: 0.004,
    searchOrder: 'date',
    publishedAfterDays: 180,
    minLeadCount: 3,
    allowWebFallback: false,
  },
  'Video Editing': {
    method: 'youtube',
    targetType: 'creator',
    ytQueries: [
      'day in my life realistic',
      'what i eat in a day full day',
      'solo travel vlog cheap budget',
      'i tried extreme challenge',
      'gym workout routine beginner',
      'small business vlog day',
      'gaming lets play episode',
      'study with me silent',
    ],
    minSubs: 800,
    maxSubs: 10000,
    maxInactiveDays: 150,
    minAvgViews: 80,
    minViewSubRatio: 0.003,
    searchOrder: 'date',
    publishedAfterDays: 240,
    minLeadCount: 3,
    allowWebFallback: false,
  },
  'Voice Over': {
    method: 'youtube',
    targetType: 'creator',
    ytQueries: [
      'true crime unsolved case',
      'horror story narration',
      'history facts world war',
      'space documentary facts',
      'ancient civilization mystery',
      'philosophy explained simple',
      'scary story animated',
      'mystery solved explained',
    ],
    minSubs: 1000,
    maxSubs: 10000,
    maxInactiveDays: 150,
    minAvgViews: 80,
    minViewSubRatio: 0.003,
    searchOrder: 'date',
    publishedAfterDays: 240,
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
    serpQuery: 'site:myshopify.com fitness OR wellness OR beauty OR skincare store',
    allowDomains: ['myshopify.com', 'gumroad.com', 'stan.store'],
    exclude: ['fiverr', 'upwork', 'mailchimp', 'klaviyo', 'agency', 'tool', 'platform', 'list', 'top 10'],
  },
  'SEO': {
    method: 'serp',
    targetType: 'business',
    serpQuery: 'site:yelp.com plumber OR dentist OR electrician OR restaurant OR salon OR gym OR lawyer OR accountant',
    allowDomains: ['yelp.com', 'yellowpages.com', 'bark.com'],
    exclude: [
      'agency', 'seo company', 'seo services', 'web design', 'digital marketing',
      'marketing company', 'website development', 'web development', 'IT company',
      'software', 'fiverr', 'upwork', 'semrush', 'ahrefs', 'list', 'top 10', 'blog'
    ],
  },
  'Funnel Building': {
    method: 'serp',
    targetType: 'business',
    serpQuery: 'site:myshopify.com OR site:gumroad.com fitness coach OR life coach OR business coach course',
    allowDomains: ['myshopify.com', 'gumroad.com', 'stan.store', 'teachable.com'],
    exclude: ['clickfunnels', 'agency', 'tool', 'platform', 'software', 'list', 'top 10'],
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
    serpQuery: 'site:myshopify.com fitness OR beauty OR lifestyle OR food brand blog',
    allowDomains: ['myshopify.com', 'shopify.com'],
    exclude: ['fiverr', 'upwork', 'agency', 'jasper', 'copy.ai', 'list', 'top 10', 'writesonic'],
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
  const painSignalsRaw = body.painSignals ?? body.pain_signals ?? body.signals ?? [];
  const hotRaw = body.hotLeadsOnly ?? body.hot_leads_only ?? body.quickMode ?? body.quick_mode ?? body.hotOnly ?? false;
  const audienceRaw =
    body.audienceSize ?? body.audience_size ?? body.audienceBucket ?? body.audience ?? body.audienceFilter ?? body.audienceTier ?? 'all';
  const serviceRaw =
    body.serviceMatch ?? body.service_match ?? body.serviceNeed ?? body.services ?? body.service ?? body.serviceFilter ?? 'all';
  const filtersRaw = body.filters ?? body.filterBy ?? body.filter_by ?? body.filter ?? [];

  console.log('[AdvancedControls raw]', JSON.stringify({
    painSignalsRaw,
    hotRaw,
    audienceRaw,
    serviceRaw,
    filtersRaw,
  }));

  const serviceFilters = asArray(serviceRaw)
    .map(normalizeServiceTag)
    .filter((x) => x && x !== 'all');

  const painSignalList = asArray(painSignalsRaw).map((s) => lower(s)).filter(Boolean);
  const filterList = asArray(filtersRaw).map((f) => lower(f)).filter(Boolean);
  const combinedFilters = [...new Set([...painSignalList, ...filterList])];
  const hasToken = (...terms) => combinedFilters.some((value) => terms.some((term) => value.includes(term)));
  const hasPoorVisualSignal = painSignalList.some((value) => value.includes('poor visual quality') || value.includes('poor visual'));
  const hotLeadsOnly =
    hotRaw === true ||
    hotRaw === 1 ||
    ['true', '1', 'yes'].includes(lower(hotRaw)) ||
    lower(hotRaw).includes('hot') ||
    painSignalList.some((value) => value.includes('no email list / funnel') || value.includes('no email list'));

  const controls = {
    audienceBucket: normalizeAudienceBucket(audienceRaw),
    serviceFilters,
    hotLeadsOnly,
    filterHighPain: hasToken('high pain', 'pain>90', 'pain >90', 'low ctr / low views', 'low ctr', 'ad spend, no funnel', 'ad spend'),
    filterActive7d: hasToken('active 7', 'last 7 days', 'uploaded in 7', 'inconsistent posting', 'inconsistent'),
    filterNoMonetization: hasToken('no monetization', 'no clear cta'),
    painSignals: painSignalList,
    scoreSignals: hasPoorVisualSignal ? ['poor-visual'] : [],
  };

  console.log('[AdvancedControls normalized]', JSON.stringify(controls));
  return controls;
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

function resolveRegionCode(locationString) {
  if (!locationString) return null;
  const key = locationString.toLowerCase().trim();
  return LOCATION_TO_REGION[key] || null;
}

function isEducationalChannel(channelTitle, channelDesc, recentVideoTitles = [], adviceTerms = []) {
  const titleLc = cleanText(channelTitle).toLowerCase();
  const descLc = cleanText(channelDesc).toLowerCase();
  const normalizedVideoTitles = (recentVideoTitles || []).map((title) => cleanText(title)).filter(Boolean);

  const channelTextHasAdvice = (adviceTerms || []).some(
    (term) => titleLc.includes(term) || descLc.includes(term)
  );
  if (channelTextHasAdvice) return true;

  const videoTitleText = normalizedVideoTitles.join(' ').toLowerCase();
  let eduVideoCount = 0;
  for (const pattern of EDUCATIONAL_VIDEO_PATTERNS) {
    if (pattern.test(videoTitleText)) {
      eduVideoCount++;
    }
  }
  if (eduVideoCount >= 3) return true;

  const redFlagCount = EDUCATIONAL_RED_FLAG_PHRASES.filter((phrase) => videoTitleText.includes(phrase)).length;
  const redFlagRatio = redFlagCount / Math.max(normalizedVideoTitles.length, 1);
  return redFlagRatio >= 0.5;
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
  skill = null,
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
  const regionCode = resolveRegionCode(location);
  const ADVICE_CHANNEL_BLOCKLIST = [
    'how to grow', 'youtube tips', 'youtube strategy', 'get more views',
    'how to make money', 'youtube algorithm', 'faceless channel tutorial',
    'how to start a channel', 'youtube automation', 'content strategy',
    'how i got', 'how to go viral', 'youtube secrets', 'monetize your channel',
    'grow your channel', 'make money youtube', 'youtube for beginners',
    'make money online', 'passive income', 'side hustle tips',
  ];

  const publishedAfter = new Date(Date.now() - safePublishedAfterDays * DAY_MS).toISOString();
  const searchQueries = (queries || []).slice(0, 10);
  const randomizedQueries = [...searchQueries].sort(() => Math.random() - 0.5);
  const rawSearchItems = [];

  console.log('[YouTubeSearch init]', JSON.stringify({
    location,
    regionCode,
    queryCount: randomizedQueries.length,
    searchOrder: safeSearchOrder,
    publishedAfterDays: safePublishedAfterDays,
  }));

  const queryResults = await Promise.allSettled(
    randomizedQueries.map(async (q) => {
      const fullQ = cleanText(location ? `${q} ${location}` : q);
      const searchUrl =
        `https://www.googleapis.com/youtube/v3/search?part=snippet` +
        `&q=${encodeURIComponent(fullQ)}` +
        `&type=video&order=${safeSearchOrder}&maxResults=50&relevanceLanguage=en` +
        (regionCode ? `&regionCode=${encodeURIComponent(regionCode)}` : '') +
        `&publishedAfter=${encodeURIComponent(publishedAfter)}` +
        `&key=${YOUTUBE}`;

      console.log('[YouTubeSearch request]', searchUrl.replace(/([?&]key=)[^&]+/i, '$1[redacted]'));
      const data = await fetchJson(searchUrl, {}, 12000);
      console.log('[YouTubeSearch responseCount]', JSON.stringify({ query: fullQ, count: data?.items?.length || 0 }));
      return data?.items || [];
    })
  );
  for (const result of queryResults) {
    if (result.status === 'fulfilled') rawSearchItems.push(...result.value);
    else {
      console.warn('[YouTubeSearch query failed]', result.reason?.message);
      console.error('YouTube video search failed:', result.reason?.message || result.reason);
    }
  }

  if (rawSearchItems.length < 20 && skill && EMERGENCY_FALLBACK_QUERIES[skill]) {
    console.log('[YouTubeSearch emergency-fallback]', JSON.stringify({
      skill,
      location,
      existingCount: rawSearchItems.length,
    }));

    const emergencyQueries = EMERGENCY_FALLBACK_QUERIES[skill];
    const emergencyResults = await Promise.allSettled(
      emergencyQueries.map(async (q) => {
        const fullQ = cleanText(location ? `${q} ${location}` : q);
        const searchUrl =
          `https://www.googleapis.com/youtube/v3/search?part=snippet` +
          `&q=${encodeURIComponent(fullQ)}` +
          `&type=video&order=${safeSearchOrder}&maxResults=30&relevanceLanguage=en` +
          (regionCode ? `&regionCode=${encodeURIComponent(regionCode)}` : '') +
          `&publishedAfter=${encodeURIComponent(publishedAfter)}` +
          `&key=${YOUTUBE}`;

        console.log('[YouTubeSearch emergency-request]', searchUrl.replace(/([?&]key=)[^&]+/i, '$1[redacted]'));
        const data = await fetchJson(searchUrl, {}, 12000);
        console.log('[YouTubeSearch emergency-responseCount]', JSON.stringify({ query: fullQ, count: data?.items?.length || 0 }));
        return data?.items || [];
      })
    );

    for (const result of emergencyResults) {
      if (result.status === 'fulfilled') rawSearchItems.push(...result.value);
      else console.warn('[YouTubeSearch emergency-query failed]', result.reason?.message);
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
  const channelById = new Map();
  await Promise.all([
    ...chunk(videoIds, 50).map(async (ids) => {
      const url =
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics` +
        `&id=${ids.join(',')}&maxResults=50&key=${YOUTUBE}`;
      try {
        const data = await fetchJson(url, {}, 10000);
        for (const v of data?.items || []) videoById.set(v.id, v);
      } catch (e) {
        console.error('YouTube videos details failed:', e.message || e);
      }
    }),
    ...chunk(channelIds, 50).map(async (ids) => {
      const url =
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics` +
        `&id=${ids.join(',')}&maxResults=50&key=${YOUTUBE}`;
      try {
        const data = await fetchJson(url, {}, 10000);
        for (const c of data?.items || []) channelById.set(c.id, c);
      } catch (e) {
        console.error('YouTube channel details failed:', e.message || e);
      }
    }),
  ]);

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
    const descLc = desc.toLowerCase();
    const isAdviceChannel = ADVICE_CHANNEL_BLOCKLIST.some(
      (term) => titleLc.includes(term) || descLc.includes(term)
    );

    if (
      !title ||
      titleLc.includes('- topic') ||
      titleLc.includes('vevo') ||
      titleLc.includes('official') ||
      isBadMarketplaceName(title)
    ) {
      continue;
    }

    if (isAdviceChannel) {
      console.log('[YouTubeSearch advice-skip]', JSON.stringify({ title, location, regionCode }));
      continue;
    }

    const subs = Number(ch.statistics?.subscriberCount || 0);
    const videoCount = Number(ch.statistics?.videoCount || 0);
    if (subs < minSubs || subs > maxSubs) continue;
    if (videoCount < 5) continue;

    const recentVideos = (videosByChannel.get(chId) || [])
      .sort((a, b) => new Date(b.snippet?.publishedAt || 0) - new Date(a.snippet?.publishedAt || 0))
      .slice(0, 6);

    const recentVideoTitles = recentVideos.map((v) => cleanText(v.snippet?.title || ''));
    if (isEducationalChannel(title, desc, recentVideoTitles, ADVICE_CHANNEL_BLOCKLIST)) {
      console.log('[YouTubeSearch educational-skip]', JSON.stringify({
        title,
        location,
        regionCode,
        sampleVideos: recentVideoTitles.slice(0, 3),
      }));
      continue;
    }

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
      recentVideoTitles,
    };

    profile.qualityScore = scoreCreatorProfile(profile, { minSubs, maxSubs });
    candidates.push(profile);
  }

  console.log('[YouTubeSearch candidates]', JSON.stringify({ location, regionCode, total: candidates.length }));
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
    const data = await fetchJson(url, {}, 8000);

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
    const data = await fetchJson(url, {}, 8000);

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
      p.qualityScore = scoreSerpProfile(p, { allowDomains });
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
    const nameText = lower(p.name);
    if (nameText.includes('agency') || nameText.includes('services ltd') || nameText.includes('top 10') || nameText.includes('best ')) return false;

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
    const skillText = SKILL_FALLBACK_TEXT[skill];
    const name = cleanText(profile.name || 'This creator');
    const problem = skillText ? skillText.problem(name) : `Their recent uploads show ${requiredWord} upside.`;
    const strategy = skillText ? skillText.strategy() : `Pitch a low-risk sprint focused on ${requiredWord} gains.`;
    console.log('[SkillFallbackText]', JSON.stringify({ skill, name, problem, strategy }));
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
  const safeLeads = Array.isArray(leads) ? leads : [];
  console.log('[LeadDiversity input]', JSON.stringify({ total: safeLeads.length, maxLeads, skill }));
  if (safeLeads.length <= maxLeads) {
    console.log('[LeadDiversity result]', JSON.stringify({ mode: 'direct', returned: safeLeads.length }));
    return safeLeads.slice(0, maxLeads);
  }

  if (safeLeads.length > maxLeads * 2) {
    const selected = [];
    const usedDomains = new Set();
    const usedBuckets = new Set();
    for (const lead of safeLeads) {
      if (selected.length >= maxLeads) break;
      const profile = profilesById.get(lead.sourceId);
      if (!profile) {
        selected.push(lead);
        continue;
      }
      const root = getRootDomain(profile.profileUrl);
      const bucket = getNicheBucket(profile, skill);
      if (root && usedDomains.has(root)) continue;
      if (usedBuckets.has(bucket)) continue;
      selected.push(lead);
      if (root) usedDomains.add(root);
      usedBuckets.add(bucket);
    }
    if (selected.length >= maxLeads) {
      console.log('[LeadDiversity result]', JSON.stringify({ mode: 'diverse', returned: selected.length }));
      return selected;
    }
    if (selected.length < maxLeads) {
      for (const lead of safeLeads) {
        if (selected.length >= maxLeads) break;
        if (!selected.find((s) => s.sourceId === lead.sourceId)) selected.push(lead);
      }
    }
    console.log('[LeadDiversity result]', JSON.stringify({ mode: 'diverse-top-up', returned: selected.length }));
    return selected;
  }

  console.log('[LeadDiversity result]', JSON.stringify({ mode: 'top-match', returned: Math.min(safeLeads.length, maxLeads) }));
  return safeLeads.slice(0, maxLeads);
}

async function readSiteSignals(profileUrl) {
  const root = getRootDomain(profileUrl);
  if (!root) return null;

  let timer = null;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 2200);
    const text = await fetch(`https://r.jina.ai/https://${root}`, { signal: controller.signal }).then((r) => r.text());
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
  let d = null;
  let ratio = null;
  let views = null;

  if (isCreator) {
    d = Number(profile.lastUploadDays ?? 999);
    ratio = Number(profile.viewSubRatio ?? 0);
    views = Number(profile.avgRecentViews ?? 0);
    if (!Number.isFinite(d)) d = 999;
    if (!Number.isFinite(ratio)) ratio = 0;
    if (!Number.isFinite(views)) views = 0;

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

  const finalPain = clamp(Math.round(pain), 55, 99);
  console.log('[painScore]', profile.name, finalPain, { d, ratio, views });
  return finalPain;
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
  const sourceProfiles = Array.isArray(profiles) ? profiles : [];
  console.log('[AdvancedFilters apply]', JSON.stringify({
    total: sourceProfiles.length,
    audienceBucket,
    serviceFilters,
    hotLeadsOnly,
    filterHighPain,
    filterActive7d,
    filterNoMonetization,
    skill,
  }));

  const filtered = sourceProfiles.filter((p) => {
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

  console.log('[AdvancedFilters result]', JSON.stringify({ kept: filtered.length, removed: sourceProfiles.length - filtered.length, skill }));
  return filtered;
}

function rankProfiles(profiles, cfg, signals = [], budget = []) {
  const signalSet = new Set((signals || []).map((s) => lower(s)));
  const budgetSet = new Set((budget || []).map((b) => lower(b)));
  console.log('[RankProfiles signals]', JSON.stringify({
    total: Array.isArray(profiles) ? profiles.length : 0,
    signals: [...signalSet],
    budget: [...budgetSet],
  }));

  return (profiles || [])
    .map((p) => {
      let score = Number(scoreByChannel(p, cfg) || 60);

      if ((cfg?.targetType === 'creator') || p.platform === 'YouTube') {
        if (signalSet.has('active-posting') && Number(p.lastUploadDays || 999) <= 14) score += 3;
        if (signalSet.has('high-engagement') && Number(p.viewSubRatio || 0) >= 0.08) score += 4;
        if (signalSet.has('poor-visual') && Number(p.viewSubRatio || 0) < 0.05) score += 5;
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
  const replyChance = clamp(Math.round(35 + (match - 70) * 1.5), 35, 90);

  const followerText = profile.followers || 'Not listed';
  const skillText = SKILL_FALLBACK_TEXT[skill];
  const name = cleanText(profile.name || 'This creator');
  const problem = skillText
    ? skillText.problem(name)
    : `${name} has clear growth potential but likely has a ${skill || 'service'} gap holding them back.`;
  const strategy = skillText
    ? skillText.strategy()
    : `Lead with one specific fix and offer a low-risk starter implementation.`;
  console.log('[FallbackLeadText]', JSON.stringify({ skill, name, problem, strategy }));

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
    dealValue: normalizeDealValue(PRICE_HINTS[skill] || PRICE_HINTS.default, PRICE_HINTS.default),
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
    ? `Creator skill selected: prioritize active creators with ${cfg?.minSubs || 2000}-${cfg?.maxSubs || 80000} subscribers who uploaded in the last ${cfg?.maxInactiveDays || 60} days and have strong recent view activity.`
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
          max_tokens: 3200,
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

    const leads = (await Promise.all((Array.isArray(ai) ? ai : [])
      .map(async (x) => {
        const p = byId.get(x?.sourceId);
        if (!p) return null;

        const match = clamp(Number(p.qualityScore || 82), 75, 99);
        const replyChance = clamp(Number(x?.replyChance || Math.round(35 + (match - 70) * 1.5)), 35, 90);

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
          dealValue: normalizeDealValue(cleanText(x?.dealValue) || PRICE_HINTS[skill] || PRICE_HINTS.default, PRICE_HINTS[skill] || PRICE_HINTS.default),
        };

        [lead.problem, lead.strategy] = await Promise.all([
          rewriteGenericField({ GROQ, value: lead.problem }),
          rewriteGenericField({ GROQ, value: lead.strategy }),
        ]);

        return applyIntentRules(lead, p, skill, cfg, p.siteSignal || null);
      })))
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
  INTERNAL_API_BASE = resolveInternalApiBase(req);

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
    const promptLocation = extractLocation(effectivePrompt);
    const locationOverride = cleanText(body.location ?? body.targetLocation ?? body.region ?? '');
    const location = locationOverride || promptLocation;
    const advanced = normalizeAdvancedControls(body);
    console.log('[AdvancedFilters normalized]', JSON.stringify(advanced));
    console.log('[Mode]', mode, '[isQuickMode]', isQuickMode);
    console.log('[Location resolved]', JSON.stringify({ locationOverride, promptLocation, location, regionCode: resolveRegionCode(location) }));
    const normalizedSignals = [...new Set([
      ...normalizeSignalTokens(signals),
      ...(advanced.scoreSignals || []),
    ])];
    console.log('[RankSignals normalized]', JSON.stringify(normalizedSignals));
    const normalizedBudget = normalizeBudgetTokens(budget);
    const planTier = resolvePlanTier(body);
    const leadTarget = computeLeadTarget({ incomeGoal, skill, planTier });
    const rankWindow = clamp(Math.max(12, leadTarget.requestedLeadCount * 4), 12, leadTarget.planMaxCandidates);

    if (isQuickMode && skill && cfg) {
      if (cfg.method === 'youtube') {
        try {
          rawProfiles = await withTimeout(searchYouTubeCreators({
            YOUTUBE,
            queries: cfg.ytQueries,
            location,
            skill,
            minSubs: cfg.minSubs,
            maxSubs: cfg.maxSubs,
            maxInactiveDays: cfg.maxInactiveDays || 60,
            minAvgViews: cfg.minAvgViews || 250,
            minViewSubRatio: cfg.minViewSubRatio || 0.01,
            searchOrder: cfg.searchOrder || 'date',
            publishedAfterDays: cfg.publishedAfterDays || 90,
          }), 25000);
        } catch (e) {
          console.warn('YouTube search timed out, trying fallback:', e.message);
          rawProfiles = [];
        }

        // Retry with broader creator discovery if strict pass returns too few leads.
        if (rawProfiles.length < Number(cfg.minLeadCount || 3)) {
          const broaderQueries = [
            ...(cfg.ytQueries || []),
            `${cleanText(skill)} youtube channel`,
            `${cleanText(skill)} creator`,
            cleanText(effectivePrompt).replace(/\bin [^,]+$/i, ''),
          ].filter(Boolean);

          let retryProfiles = [];
          try {
            await wait(300);
            retryProfiles = await withTimeout(searchYouTubeCreators({
              YOUTUBE,
              queries: broaderQueries,
              location,
              skill,
              minSubs: Math.max(500, Number(cfg.minSubs || 2000) - 1500),
              maxSubs: Number(cfg.maxSubs || 70000) + 40000,
              maxInactiveDays: Math.max(120, Number(cfg.maxInactiveDays || 60)),
              minAvgViews: Math.max(80, Number(cfg.minAvgViews || 250) - 120),
              minViewSubRatio: Math.max(0.003, Number(cfg.minViewSubRatio || 0.01) - 0.004),
              searchOrder: cfg.searchOrder || 'date',
              publishedAfterDays: Math.max(270, Number(cfg.publishedAfterDays || 90)),
            }), 25000);
          } catch (e) {
            console.warn('YouTube retry timed out, trying fallback:', e.message);
          }

          rawProfiles = dedupeProfiles([...rawProfiles, ...retryProfiles]);
        }

        // Important: for creator skills we avoid generic web fallback by default.
        if (!rawProfiles.length && cfg.allowWebFallback) {
          try {
            await wait(300);
            rawProfiles = await withTimeout(runSerpGoogle(`${skill} creator ${location} -agency -fiverr -upwork`, {
              SERP,
              excludeTerms: ['agency', 'fiverr', 'upwork', 'template', 'tool', 'software'],
              allowDomains: ['youtube.com', 'instagram.com', 'tiktok.com'],
            }), 8000);
          } catch (e) {
            console.warn('Creator SERP fallback timed out, trying fallback:', e.message);
            rawProfiles = [];
          }
        }
      } else if (cfg.method === 'maps') {
        const mapsQ = location ? `${cfg.apifyMaps} in ${location}` : cfg.apifyMaps;
        try {
          rawProfiles = await withTimeout(runSerpMaps(cfg.serpQuery + (location ? ` in ${location}` : ''), SERP), 8000);
        } catch (e) {
          console.warn('SERP maps timed out, trying fallback:', e.message);
          rawProfiles = [];
        }
        if (!rawProfiles.length) {
          try {
            await wait(300);
            rawProfiles = await withTimeout(runApifyMaps(mapsQ, APIFY), 8000);
          } catch (e) {
            console.warn('Apify maps timed out, trying fallback:', e.message);
            rawProfiles = [];
          }
        }
      } else if (cfg.method === 'serp') {
        const serpQ = location ? `${cfg.serpQuery} ${location}` : cfg.serpQuery;
        try {
          rawProfiles = await withTimeout(runSerpGoogle(serpQ, {
            SERP,
            excludeTerms: cfg.exclude || [],
            allowDomains: cfg.allowDomains || [],
          }), 8000);
        } catch (e) {
          console.warn('SERP search timed out, trying fallback:', e.message);
          rawProfiles = [];
        }

        // Broaden if too narrow
        if (rawProfiles.length < 2 && cfg?.method === 'serp' && ['SEO', 'Email Marketing', 'Funnel Building', 'Content Writing'].includes(skill)) {
          console.log('[SERP broadening] too few results, retrying without site: restriction');
          const broaderQ = (cfg.serpQuery || '').replace(/site:\S+\s*/g, '').replace(/^OR\s+/i, '').trim();
          if (broaderQ) {
            rawProfiles = await withTimeout(
              runSerpGoogle(location ? `${broaderQ} ${location}` : broaderQ, {
                SERP,
                excludeTerms: cfg.exclude || [],
                allowDomains: [],
              }),
              10000
            );
          }
          console.log('[SERP broadened results]', rawProfiles.length);
        }

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
            let chunked = [];
            try {
              await wait(300);
              chunked = await withTimeout(runSerpGoogle(q, {
                SERP,
                excludeTerms: cfg.exclude || [],
                allowDomains: [],
              }), 8000);
            } catch (e) {
              console.warn('SERP alt query timed out, trying fallback:', e.message);
            }
            extra.push(...chunked);
            if (extra.length >= 12) break;
          }

          rawProfiles = dedupeProfiles([...rawProfiles, ...extra]);
        }
      }

      // Last quick fallback: one broad pass so skill-only quick mode doesn't go empty too easily.
      if (!rawProfiles.length) {
        if (cfg.targetType === 'creator') {
          try {
            await wait(300);
            rawProfiles = await withTimeout(searchYouTubeCreators({
              YOUTUBE,
              queries: EMERGENCY_FALLBACK_QUERIES[skill] || ['daily vlog', 'travel tips', 'cooking recipes', 'study with me'],
              location: '',
              skill,
              minSubs: 500,
              maxSubs: 250000,
              maxInactiveDays: 200,
              minAvgViews: 40,
              minViewSubRatio: 0.001,
              searchOrder: cfg.searchOrder || 'date',
              publishedAfterDays: 365,
            }), 25000);
          } catch (e) {
            console.warn('YouTube broad fallback timed out, trying fallback:', e.message);
            rawProfiles = [];
          }
        } else if (cfg.method === 'maps') {
          try {
            await wait(300);
            rawProfiles = await withTimeout(runSerpMaps(`${cleanText(skill)} services ${location || ''}`.trim(), SERP), 8000);
          } catch (e) {
            console.warn('Maps broad fallback timed out, trying fallback:', e.message);
            rawProfiles = [];
          }
          if (!rawProfiles.length) {
            try {
              await wait(300);
              rawProfiles = await withTimeout(runSerpGoogle(`${cleanText(skill)} business website ${location || ''}`.trim(), {
                SERP,
                excludeTerms: cfg.exclude || [],
                allowDomains: [],
              }), 8000);
            } catch (e) {
              console.warn('Maps-to-SERP fallback timed out, trying fallback:', e.message);
              rawProfiles = [];
            }
          }
        } else {
          try {
            await wait(300);
            rawProfiles = await withTimeout(runSerpGoogle(`${cleanText(skill)} business website ${location || ''}`.trim(), {
              SERP,
              excludeTerms: cfg.exclude || [],
              allowDomains: [],
            }), 8000);
          } catch (e) {
            console.warn('SERP broad fallback timed out, trying fallback:', e.message);
            rawProfiles = [];
          }
        }
      }
    } else {
      // Deep mode keeps broad categories, but still passes through quality gate + ranking.
      if (type === 'Local Businesses') {
        try {
          rawProfiles = await withTimeout(runApifyMaps(effectivePrompt, APIFY), 8000);
        } catch (e) {
          console.warn('Apify deep scan timed out, trying fallback:', e.message);
          rawProfiles = [];
        }
        if (!rawProfiles.length) {
          try {
            await wait(300);
            rawProfiles = await withTimeout(runSerpMaps(effectivePrompt, SERP), 8000);
          } catch (e) {
            console.warn('SERP maps deep fallback timed out, trying fallback:', e.message);
            rawProfiles = [];
          }
        }
      } else if (type === 'Content Creators') {
        try {
          rawProfiles = await withTimeout(searchYouTubeCreators({
            YOUTUBE,
            queries: [effectivePrompt],
            location,
            skill,
            minSubs: 2000,
            maxSubs: platform === 'youtube' ? 100000 : 70000,
          }), 25000);
        } catch (e) {
          console.warn('Content creator search timed out, trying fallback:', e.message);
          rawProfiles = [];
        }
      } else if (type === 'Startups') {
        try {
          rawProfiles = await withTimeout(runSerpGoogle(`site:producthunt.com/products ${effectivePrompt}`, {
            SERP,
            allowDomains: ['producthunt.com'],
          }), 8000);
        } catch (e) {
          console.warn('Startup search timed out, trying fallback:', e.message);
          rawProfiles = [];
        }
      } else if (type === 'E-commerce Brands') {
        try {
          rawProfiles = await withTimeout(runSerpGoogle(`site:myshopify.com ${effectivePrompt} -blog -list -template`, {
            SERP,
            allowDomains: ['myshopify.com'],
            excludeTerms: ['blog', 'template', 'top 10'],
          }), 8000);
        } catch (e) {
          console.warn('E-commerce search timed out, trying fallback:', e.message);
          rawProfiles = [];
        }
      } else if (type === 'Coaches & Consultants') {
        try {
          rawProfiles = await withTimeout(runSerpGoogle(`site:linkedin.com/in ${effectivePrompt} coach OR consultant -recruiter`, {
            SERP,
            allowDomains: ['linkedin.com'],
          }), 8000);
        } catch (e) {
          console.warn('Coach search timed out, trying fallback:', e.message);
          rawProfiles = [];
        }
      } else {
        try {
          rawProfiles = await withTimeout(runSerpGoogle(effectivePrompt, { SERP }), 8000);
        } catch (e) {
          console.warn('Generic SERP search timed out, trying fallback:', e.message);
          rawProfiles = [];
        }
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

    leads = await attachOutreachAssets(leads, skill);

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
