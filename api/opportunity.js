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
    allowWebFallback: false,
  },
  'Video Editing': {
    method: 'youtube',
    targetType: 'creator',
    ytQueries: [
      'vlog youtube channel',
      'travel youtube channel',
      'podcast clips youtube',
      'business youtube channel',
      'fitness youtube channel',
    ],
    minSubs: 3000,
    maxSubs: 70000,
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
    serpQuery: 'site:producthunt.com/products saas startup launched',
    allowDomains: ['producthunt.com'],
    exclude: ['agency', 'tool', 'platform', 'semrush', 'ahrefs'],
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
    serpQuery: 'site:producthunt.com/products saas OR software startup',
    allowDomains: ['producthunt.com'],
    exclude: ['fiverr', 'upwork', 'agency', 'tool', 'platform', 'jasper', 'copy.ai'],
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

function scoreCreatorProfile(p, cfg) {
  const subs = Number(p.subscriberCount || 0);
  const ratio = Number(p.viewSubRatio || 0);
  const lastUploadDays = Number(p.lastUploadDays || 999);
  const avgViews = Number(p.avgRecentViews || 0);

  let score = 50;

  if (subs >= 5000 && subs <= Math.min(50000, cfg.maxSubs || 50000)) score += 12;
  else if (subs >= cfg.minSubs && subs <= cfg.maxSubs) score += 7;

  if (lastUploadDays <= 14) score += 12;
  else if (lastUploadDays <= 30) score += 8;
  else if (lastUploadDays <= 45) score += 4;

  if (ratio >= 0.12) score += 14;
  else if (ratio >= 0.07) score += 10;
  else if (ratio >= 0.04) score += 6;
  else if (ratio >= 0.02) score += 2;

  if (avgViews >= 5000) score += 8;
  else if (avgViews >= 1500) score += 5;
  else if (avgViews >= 700) score += 2;

  return clamp(Math.round(score), 55, 99);
}

function scoreBusinessProfile(p) {
  const reviews = Number(p.reviews || 0);
  const rating = Number(p.rating || 0);
  let score = 58;

  if (rating >= 4.6) score += 10;
  else if (rating >= 4.2) score += 7;
  else if (rating >= 3.8) score += 4;

  if (reviews >= 200) score += 9;
  else if (reviews >= 70) score += 6;
  else if (reviews >= 20) score += 3;

  if (p.website || p.phone) score += 6;
  if (p.profileUrl) score += 4;

  return clamp(Math.round(score), 55, 95);
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

async function searchYouTubeCreators({ YOUTUBE, queries, location, minSubs, maxSubs }) {
  if (!YOUTUBE) return [];

  const publishedAfter = new Date(Date.now() - 90 * DAY_MS).toISOString();
  const searchQueries = (queries || []).slice(0, 5);
  const rawSearchItems = [];

  for (const q of searchQueries) {
    const fullQ = cleanText(location ? `${q} ${location}` : q);
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search?part=snippet` +
      `&q=${encodeURIComponent(fullQ)}` +
      `&type=video&order=date&maxResults=25&relevanceLanguage=en` +
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

    // Strict quality gate for creator leads: small + active + real view activity
    if (lastUploadDays > 60) continue;
    if (avgRecentViews < 250) continue;
    if (viewSubRatio < 0.01) continue;

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
      p.qualityScore = scoreBusinessProfile(p);
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
      p.qualityScore = scoreBusinessProfile(p);
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
    'fiverr', 'upwork', 'freelancer.com', 'veed', 'canva', 'agency', 'tool',
    'software', 'platform', 'hire', 'blog', 'list', 'top 10', 'best ', 'template',
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
      p.qualityScore = scoreBusinessProfile(p);
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
      if (Number(p.lastUploadDays || 999) > 60) return false;
      if (Number(p.avgRecentViews || 0) < 250) return false;
      if (Number(p.viewSubRatio || 0) < 0.01) return false;
      return true;
    }

    // Business quality gate.
    if (p.platform === 'Website' && !p.description) return false;
    if (!p.profileUrl.startsWith('http')) return false;

    return true;
  });
}

function rankProfiles(profiles, cfg, signals = [], budget = []) {
  const signalSet = new Set((signals || []).map((s) => lower(s)));
  const budgetSet = new Set((budget || []).map((b) => lower(b)));

  return (profiles || [])
    .map((p) => {
      let score = Number(p.qualityScore || 60);

      if ((cfg?.targetType === 'creator') || p.platform === 'YouTube') {
        if (signalSet.has('active-posting') && Number(p.lastUploadDays || 999) <= 14) score += 3;
        if (signalSet.has('high-engagement') && Number(p.viewSubRatio || 0) >= 0.08) score += 4;
        if (budgetSet.has('low-ticket') && Number(p.subscriberCount || 0) <= 30000) score += 2;
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

async function enrichWithGroq({ GROQ, profiles, skill, incomeGoal, cfg }) {
  const candidates = profiles.slice(0, 8);
  if (!candidates.length) return [];

  if (!GROQ) {
    return candidates.slice(0, 3).map((p) => fallbackLeadFromProfile(p, skill, cfg));
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
- redFlag must be null or one concise warning.

Return JSON array with max 3 items:
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

    const byId = new Map(candidates.map((p) => [p.sourceId, p]));

    const leads = (Array.isArray(ai) ? ai : [])
      .map((x) => {
        const p = byId.get(x?.sourceId);
        if (!p) return null;

        const match = clamp(Number(p.qualityScore || 82), 75, 99);
        const replyChance = clamp(Number(x?.replyChance || Math.round(35 + (match - 70) * 1.0)), 35, 90);

        return {
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
      })
      .filter(Boolean)
      .slice(0, 3);

    if (leads.length) return leads;
  } catch (e) {
    console.error('Groq enrichment failed:', e.message || e);
  }

  return candidates.slice(0, 3).map((p) => fallbackLeadFromProfile(p, skill, cfg));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    type = 'Local Businesses',
    prompt = '',
    platform = 'all',
    skill = null,
    mode = 'quick',
    incomeGoal = null,
    signals = [],
    budget = [],
  } = req.body || {};

  if (!cleanText(prompt)) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  const SERP = process.env.SERPAPI_KEY;
  const GROQ = process.env.GROQ_API_KEY;
  const APIFY = process.env.APIFY_API_TOKEN;
  const YOUTUBE = process.env.YOUTUBE_API_KEY;

  let rawProfiles = [];

  try {
    const cfg = skill ? SKILL_CONFIG[skill] : null;
    const location = extractLocation(prompt);

    if (mode === 'quick' && skill && cfg) {
      if (cfg.method === 'youtube') {
        rawProfiles = await searchYouTubeCreators({
          YOUTUBE,
          queries: cfg.ytQueries,
          location,
          minSubs: cfg.minSubs,
          maxSubs: cfg.maxSubs,
        });

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
        rawProfiles = await runApifyMaps(mapsQ, APIFY);
        if (!rawProfiles.length) {
          rawProfiles = await runSerpMaps(cfg.serpQuery + (location ? ` in ${location}` : ''), SERP);
        }
      } else if (cfg.method === 'serp') {
        const serpQ = location ? `${cfg.serpQuery} ${location}` : cfg.serpQuery;
        rawProfiles = await runSerpGoogle(serpQ, {
          SERP,
          excludeTerms: cfg.exclude || [],
          allowDomains: cfg.allowDomains || [],
        });
      }
    } else {
      // Deep mode keeps broad categories, but still passes through quality gate + ranking.
      if (type === 'Local Businesses') {
        rawProfiles = await runApifyMaps(prompt, APIFY);
        if (!rawProfiles.length) rawProfiles = await runSerpMaps(prompt, SERP);
      } else if (type === 'Content Creators') {
        rawProfiles = await searchYouTubeCreators({
          YOUTUBE,
          queries: [prompt],
          location,
          minSubs: 2000,
          maxSubs: platform === 'youtube' ? 100000 : 70000,
        });
      } else if (type === 'Startups') {
        rawProfiles = await runSerpGoogle(`site:producthunt.com/products ${prompt}`, {
          SERP,
          allowDomains: ['producthunt.com'],
        });
      } else if (type === 'E-commerce Brands') {
        rawProfiles = await runSerpGoogle(`site:myshopify.com ${prompt} -blog -list -template`, {
          SERP,
          allowDomains: ['myshopify.com'],
          excludeTerms: ['blog', 'template', 'top 10'],
        });
      } else if (type === 'Coaches & Consultants') {
        rawProfiles = await runSerpGoogle(`site:linkedin.com/in ${prompt} coach OR consultant -recruiter`, {
          SERP,
          allowDomains: ['linkedin.com'],
        });
      } else {
        rawProfiles = await runSerpGoogle(prompt, { SERP });
      }
    }

    const gated = qualityGate(dedupeProfiles(rawProfiles), cfg);
    const ranked = rankProfiles(gated, cfg, signals, budget).slice(0, 12);

    console.log(`[OppEngine v2] mode=${mode} skill=${skill} raw=${rawProfiles.length} gated=${gated.length} ranked=${ranked.length}`);

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

    const leads = await enrichWithGroq({ GROQ, profiles: ranked, skill, incomeGoal, cfg });

    return res.status(200).json({
      leads,
      source: 'live',
      count: leads.length,
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
