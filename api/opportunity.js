// api/opportunity.js
// Opportunity Engine — YouTube API (capped) + Apify Maps + SerpApi + Groq
// Vercel timeout: 60 seconds

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    type       = 'Local Businesses',
    prompt     = '',
    platform   = 'all',
    skill      = null,
    mode       = 'quick',
    incomeGoal = null,
    signals    = [],
    budget     = [],
  } = req.body;

  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const SERP    = process.env.SERPAPI_KEY;
  const GROQ    = process.env.GROQ_API_KEY;
  const APIFY   = process.env.APIFY_API_TOKEN;
  const YOUTUBE = process.env.YOUTUBE_API_KEY;

  let rawProfiles = [];

  // ─────────────────────────────────────────────────────────
  // SKILL CONFIG
  // ─────────────────────────────────────────────────────────
  const SKILL_CONFIG = {
    'Thumbnail Design': {
      method:    'youtube',
      ytQuery:   'fitness cooking education tutorial vlog channel',
      maxSubs:   50000,
      minSubs:   1000,
      serpQuery: null,
      apifyMaps: null,
      exclude:   ['fiverr','upwork','veed','canva','agency','tool','software','platform','hire'],
    },
    'Video Editing': {
      method:    'youtube',
      ytQuery:   'vlog lifestyle travel daily cooking channel',
      maxSubs:   50000,
      minSubs:   1000,
      serpQuery: null,
      apifyMaps: null,
      exclude:   ['fiverr','upwork','veed','agency','tool','software','platform'],
    },
    'Voice Over': {
      method:    'youtube',
      ytQuery:   'educational explainer animation tutorial channel',
      maxSubs:   50000,
      minSubs:   500,
      serpQuery: null,
      apifyMaps: null,
      exclude:   ['fiverr','upwork','voices.com','agency','studio'],
    },
    'Social Media Management': {
      method:    'maps',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'restaurant cafe salon gym fitness studio local business',
      apifyMaps: 'restaurant cafe salon gym fitness studio',
      exclude:   ['agency','management company','marketing firm'],
    },
    'Web Design': {
      method:    'maps',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'local business shop clinic dentist lawyer accountant',
      apifyMaps: 'local business shop clinic dentist',
      exclude:   ['agency','web design company','wix','squarespace','template'],
    },
    'Copywriting': {
      method:    'serp',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'site:myshopify.com clothing OR beauty OR fitness OR supplements store',
      apifyMaps: null,
      exclude:   ['fiverr','upwork','blog','list','top 10','agency','template','theme'],
    },
    'Email Marketing': {
      method:    'serp',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'site:linkedin.com/in life coach OR business coach OR fitness coach -recruiter -hiring',
      apifyMaps: null,
      exclude:   ['fiverr','upwork','mailchimp','klaviyo','agency','tool','platform'],
    },
    'SEO': {
      method:    'serp',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'site:producthunt.com/products saas startup launched',
      apifyMaps: null,
      exclude:   ['agency','tool','platform','semrush','ahrefs'],
    },
    'Funnel Building': {
      method:    'serp',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'site:linkedin.com/in life coach OR business coach OR fitness coach OR wellness coach -recruiter -hiring',
      apifyMaps: null,
      exclude:   ['clickfunnels','agency','tool','platform','software'],
    },
    'Graphic Design': {
      method:    'serp',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'site:myshopify.com clothing OR accessories OR beauty brand store',
      apifyMaps: null,
      exclude:   ['canva','fiverr','upwork','agency','template','tool'],
    },
    'Paid Ads': {
      method:    'serp',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'site:myshopify.com ecommerce store fashion OR beauty OR fitness',
      apifyMaps: null,
      exclude:   ['agency','facebook','google ads','tool','platform'],
    },
    'Content Writing': {
      method:    'serp',
      ytQuery:   null,
      maxSubs:   null,
      minSubs:   null,
      serpQuery: 'site:producthunt.com/products saas OR software startup',
      apifyMaps: null,
      exclude:   ['fiverr','upwork','agency','tool','platform','jasper','copy.ai'],
    },
  };

  // ─────────────────────────────────────────────────────────
  // HELPER: YouTube API — strict subscriber cap
  // ─────────────────────────────────────────────────────────
  async function searchYouTube(query, minSubs = 1000, maxSubs = 50000, location = '') {
    if (!YOUTUBE) return [];
    try {
      const q = location ? `${query} ${location}` : query;
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=25&relevanceLanguage=en&key=${YOUTUBE}`;
      const searchRes  = await fetch(searchUrl);
      const searchData = await searchRes.json();

      if (searchData.error) {
        console.error('YouTube API error:', searchData.error.message);
        return [];
      }
      if (!searchData.items?.length) return [];

      const ids = searchData.items.map(i => i.id?.channelId).filter(Boolean).join(',');
      if (!ids) return [];

      const detailUrl  = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ids}&key=${YOUTUBE}`;
      const detailRes  = await fetch(detailUrl);
      const detailData = await detailRes.json();

      return (detailData.items || [])
        .filter(ch => {
          const title = (ch.snippet?.title || '').toLowerCase();
          const subs  = parseInt(ch.statistics?.subscriberCount || 0);
          // STRICT subscriber cap
          return !title.includes('- topic') &&
                 !title.includes('vevo') &&
                 !title.includes(' - music') &&
                 !title.includes('official') &&
                 subs >= minSubs &&
                 subs <= maxSubs;
        })
        .map(ch => {
          const subs = parseInt(ch.statistics?.subscriberCount || 0);
          const fmt  = subs >= 1000000
            ? `${(subs/1000000).toFixed(1)}M subscribers`
            : `${(subs/1000).toFixed(1)}k subscribers`;
          return {
            name:            ch.snippet?.title,
            description:     ch.snippet?.description?.slice(0, 300),
            subscribers:     fmt,
            subscriberCount: subs,
            videoCount:      parseInt(ch.statistics?.videoCount || 0),
            viewCount:       parseInt(ch.statistics?.viewCount || 0),
            country:         ch.snippet?.country || 'Unknown',
            profileUrl:      ch.snippet?.customUrl
              ? `https://youtube.com/${ch.snippet.customUrl}`
              : `https://youtube.com/channel/${ch.id}`,
            platform: 'YouTube',
          };
        });
    } catch (e) {
      console.error('YouTube fetch error:', e.message);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // HELPER: Apify Google Maps
  // ─────────────────────────────────────────────────────────
  async function runApifyMaps(query) {
    if (!APIFY) return [];
    try {
      const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${APIFY}&timeout=45`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchStringsArray: [query],
          maxCrawledPlacesPerSearch: 8,
          language: 'en',
        }),
      });
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.slice(0, 8).map(item => ({
        name:        item.title,
        description: `${item.categoryName || 'Business'} | Rating: ${item.totalScore || 'N/A'} | Reviews: ${item.reviewsCount || 0} | ${item.address || ''}`,
        rating:      item.totalScore,
        reviews:     item.reviewsCount,
        phone:       item.phone,
        website:     item.website || null,
        profileUrl:  item.website || item.url || null,
        platform:    'Google Maps',
      }));
    } catch (e) {
      console.error('Apify Maps error:', e.message);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // HELPER: SerpApi Google Maps
  // ─────────────────────────────────────────────────────────
  async function runSerpMaps(query) {
    if (!SERP) return [];
    try {
      const url  = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&type=search&api_key=${SERP}`;
      const res  = await fetch(url);
      const data = await res.json();
      return (data.local_results || []).slice(0, 8).map(r => ({
        name:        r.title,
        description: `${r.type || 'Business'} | Rating: ${r.rating || 'N/A'} | Reviews: ${r.reviews || 0} | ${r.address || ''}`,
        rating:      r.rating,
        reviews:     r.reviews,
        phone:       r.phone,
        website:     r.website || null,
        profileUrl:  r.website || null,
        platform:    'Google Maps',
      }));
    } catch (e) {
      console.error('SerpApi Maps error:', e.message);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // HELPER: SerpApi Google Search — hard filtered
  // ─────────────────────────────────────────────────────────
  async function runSerpGoogle(query, excludeTerms = []) {
    if (!SERP) return [];
    const GLOBAL_BAD = ['fiverr','upwork','freelancer.com','veed','canva','agency','tool',
      'software','platform','hire','blog','list','top 10','best ','template','theme',
      'how to','oberlo','shopify.com/blog','omegatheme','marketing company','design company',
      'article','guide','reddit','quora','youtube.com/watch','facebook.com/groups'];
    try {
      const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const res  = await fetch(url);
      const data = await res.json();
      return (data.organic_results || [])
        .filter(r => {
          const link  = (r.link || '').toLowerCase();
          const title = (r.title || '').toLowerCase();
          const allBad = [...GLOBAL_BAD, ...excludeTerms];
          return !allBad.some(t => link.includes(t) || title.includes(t));
        })
        .slice(0, 8)
        .map(r => ({
          name:        r.title,
          description: r.snippet,
          profileUrl:  r.link,
          platform:    r.link?.includes('youtube.com')    ? 'YouTube'
                     : r.link?.includes('instagram.com')  ? 'Instagram'
                     : r.link?.includes('linkedin.com')   ? 'LinkedIn'
                     : r.link?.includes('tiktok.com')     ? 'TikTok'
                     : r.link?.includes('myshopify.com')  ? 'Shopify'
                     : r.link?.includes('producthunt.com')? 'Product Hunt'
                     : 'Website',
        }));
    } catch (e) {
      console.error('SerpApi Google error:', e.message);
      return [];
    }
  }

  try {
    // ─────────────────────────────────────────────────────────
    // STEP 1 — SCRAPE
    // ─────────────────────────────────────────────────────────
    const cfg      = skill ? SKILL_CONFIG[skill] : null;
    const location = prompt.includes(' in ') ? prompt.split(' in ').slice(1).join(' in ') : '';

    if (mode === 'quick' && skill) {

      if (cfg) {
        if (cfg.method === 'youtube' && YOUTUBE) {
          // YouTube with STRICT subscriber cap
          rawProfiles = await searchYouTube(
            cfg.ytQuery,
            cfg.minSubs,
            cfg.maxSubs,
            location
          );

          // If YouTube returns nothing, fall back to SerpApi LinkedIn/Web search
          if (rawProfiles.length === 0) {
            const fallbackQ = `${skill} creator OR youtuber under 50k subscribers ${location} -agency -fiverr`;
            rawProfiles = await runSerpGoogle(fallbackQ, cfg.exclude || []);
          }

        } else if (cfg.method === 'maps') {
          const mapsQ = location ? `${cfg.apifyMaps} in ${location}` : cfg.apifyMaps;

          // Try Apify Maps first
          rawProfiles = await runApifyMaps(mapsQ);

          // Fallback to SerpApi Maps
          if (rawProfiles.length === 0) {
            rawProfiles = await runSerpMaps(cfg.serpQuery + (location ? ` in ${location}` : ''));
          }

        } else if (cfg.method === 'serp') {
          const serpQ = location ? `${cfg.serpQuery} ${location}` : cfg.serpQuery;
          rawProfiles = await runSerpGoogle(serpQ, cfg.exclude || []);

          // Fallback broader search
          if (rawProfiles.length === 0) {
            const broaderQ = location
              ? `${skill} client ${location} -agency -fiverr -upwork`
              : `small business needing ${skill} -agency -fiverr -upwork -blog`;
            rawProfiles = await runSerpGoogle(broaderQ, cfg.exclude || []);
          }
        }

      } else {
        // "Other" custom skill
        const customQ = location
          ? `${skill} client ${location} -agency -fiverr -upwork -tool`
          : `small business creator needing ${skill} -agency -fiverr -upwork -blog -list`;
        rawProfiles = await runSerpGoogle(customQ);
      }

    } else {
      // ── DEEP SCAN MODE ──
      if (type === 'Local Businesses') {
        rawProfiles = await runApifyMaps(prompt);
        if (rawProfiles.length === 0) rawProfiles = await runSerpMaps(prompt);
        if (rawProfiles.length === 0) rawProfiles = await runSerpGoogle(prompt + ' local business -agency');

      } else if (type === 'Content Creators') {
        if (platform === 'youtube' || platform === 'all') {
          rawProfiles = await searchYouTube(prompt, 1000, 200000, location);
        }
        if (rawProfiles.length === 0) {
          rawProfiles = await runSerpGoogle(`${prompt} creator -agency -fiverr`);
        }

      } else if (type === 'Startups') {
        const r1 = await runSerpGoogle(`site:producthunt.com/products ${prompt}`);
        rawProfiles = r1.length > 0 ? r1 : await runSerpGoogle(`${prompt} startup saas -agency`);

      } else if (type === 'E-commerce Brands') {
        const r1 = await runSerpGoogle(`site:myshopify.com ${prompt} -blog -list -template`);
        rawProfiles = r1.length > 0 ? r1 : await runSerpGoogle(`${prompt} ecommerce store -blog -agency`);

      } else if (type === 'Coaches & Consultants') {
        const r1 = await runSerpGoogle(`site:linkedin.com/in ${prompt} coach OR consultant -recruiter`);
        rawProfiles = r1.filter(r => (r.profileUrl||'').includes('linkedin.com/in/'));
        if (rawProfiles.length === 0) rawProfiles = await runSerpGoogle(`${prompt} coach consultant -agency`);
      }
    }

    console.log(`[OppEngine] mode=${mode} skill=${skill} profiles=${rawProfiles.length}`);

    if (rawProfiles.length === 0) {
      return res.status(200).json({
        leads: [], source: 'live', empty: true,
        warning: 'No clients found. Try a different location or skill.',
      });
    }

    // ─────────────────────────────────────────────────────────
    // STEP 2 — GROQ: Analyse → Actionable Leads
    // ─────────────────────────────────────────────────────────
    const skillContext  = skill ? `Freelancer skill: ${skill}. ONLY pick leads who specifically need ${skill}.` : '';
    const incomeContext = incomeGoal ? `Freelancer income goal: $${incomeGoal}/month. Price deals accordingly.` : '';
    const subsContext   = (cfg?.method === 'youtube')
      ? `All YouTube channels in this data have between ${cfg.minSubs} and ${cfg.maxSubs} subscribers — these are SMALL creators, NOT famous people. Do NOT reject them for being small — small is exactly what we want.`
      : '';

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ}` },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are a freelance client-finder for Lancify.
${skillContext}
${incomeContext}
${subsContext}

Here are REAL scraped profiles:
${JSON.stringify(rawProfiles.slice(0, 8), null, 2)}

CRITICAL RULES:
- Pick REAL businesses, small creators, or individuals who could hire a freelancer
- NEVER pick: Fiverr, Upwork, Veed, Canva, agencies, tools, software, marketplaces, blog posts
- For YouTube: small channels (1k–50k subs) are PERFECT leads — do not skip them
- Use REAL name and REAL profileUrl from data — never invent URLs
- redFlag: specific warning OR JSON null — NEVER the text "null"
- followers: real subscriber count from data e.g. "12.4k subscribers"
- dealValue: realistic beginner price e.g. "$150 – $350"
- problem: 1 plain sentence, specific to their data
- strategy: 1 sentence, exactly how to contact them

Return top 3 as JSON array:
[{
  "name": "real channel or business name",
  "platform": "YouTube / Instagram / LinkedIn / Google Maps / Shopify / Website",
  "followers": "e.g. '12.4k subscribers' — from their real data",
  "problem": "their specific problem in 1 plain sentence",
  "strategy": "exactly how to contact and pitch in 1 sentence",
  "match": <80-99>,
  "reason": "why this is a good client for this skill",
  "whyNow": "why reach out this week",
  "redFlag": null,
  "closingHint": "simple closing tip for a beginner",
  "replyChance": <35-90>,
  "jobDesc": "what they would post on Upwork",
  "profileUrl": "exact URL from the data",
  "dealValue": "$X – $Y"
}]

Return ONLY the raw JSON array. No markdown. No explanation.`,
        }],
      }),
    });

    const groqData = await groqRes.json();
    const rawText  = groqData?.choices?.[0]?.message?.content || '[]';

    let leads = [];
    try {
      leads = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch { leads = []; }

    // Clean bad values
    leads = leads.map(l => ({
      ...l,
      redFlag:   (!l.redFlag || ['null','None','none','N/A',''].includes(String(l.redFlag))) ? null : l.redFlag,
      followers: (!l.followers || ['no data','N/A','undefined','null'].includes(String(l.followers))) ? 'Not listed' : l.followers,
    }));

    // Final safety — remove known platforms
    const BAD_NAMES = ['fiverr','upwork','veed','canva','freelancer','toptal','99designs','guru','indeed','glassdoor'];
    leads = leads.filter(l => !BAD_NAMES.some(b => (l.name || '').toLowerCase().includes(b)));

    return res.status(200).json({ leads, source: 'live', count: leads.length });

  } catch (err) {
    console.error('Opportunity Engine fatal error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [], source: 'error' });
  }
}
