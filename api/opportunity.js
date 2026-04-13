// api/opportunity.js
// Opportunity Engine — Quick Find (skill-based) + Deep Scan
// APIs: SerpApi (primary) + YouTube Data API v3 (YouTube only) + Groq
 
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const {
    type      = 'Local Businesses',
    prompt    = '',
    signals   = [],
    budget    = [],
    platform  = 'all',
    skill     = null,
    mode      = 'deep',
    incomeGoal = null,
  } = req.body;
 
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });
 
  const SERP    = process.env.SERPAPI_KEY;
  const GROQ    = process.env.GROQ_API_KEY;
  const YOUTUBE = process.env.YOUTUBE_API_KEY;
 
  let rawProfiles = [];
  let apiWarning  = null;
 
  // ─────────────────────────────────────────────────────────
  // SKILL CONFIG MAP
  // Each skill defines what to search for across ALL platforms
  // ─────────────────────────────────────────────────────────
  const skillConfig = {
    'Thumbnail Design': {
      searches: [
        { engine: 'youtube', q: 'fitness cooking education tutorial channel', maxSubs: 100000 },
        { engine: 'google',  q: 'YouTube channel bad thumbnails low views fitness OR cooking OR education -agency -template' },
      ],
    },
    'Video Editing': {
      searches: [
        { engine: 'youtube', q: 'vlog lifestyle travel daily channel', maxSubs: 80000 },
        { engine: 'google',  q: 'content creator inconsistent uploads needs video editor site:instagram.com OR site:youtube.com' },
      ],
    },
    'Copywriting': {
      searches: [
        { engine: 'google',  q: 'Shopify clothing beauty fitness store -blog -list -template -"top 10"' },
        { engine: 'google',  q: 'small business website weak homepage copy no clear value proposition -agency' },
      ],
    },
    'Email Marketing': {
      searches: [
        { engine: 'google',  q: 'coach consultant no email list no newsletter site:linkedin.com/in -recruiter' },
        { engine: 'google',  q: 'online business no email marketing no welcome sequence -agency' },
      ],
    },
    'Social Media Management': {
      searches: [
        { engine: 'maps',    q: 'restaurant cafe salon gym' },
        { engine: 'google',  q: 'local business inactive Instagram dead social media -agency -marketing company' },
      ],
    },
    'Web Design': {
      searches: [
        { engine: 'maps',    q: 'local business shop clinic restaurant' },
        { engine: 'google',  q: 'small business no website or outdated website -agency -template -wix -squarespace' },
      ],
    },
    'SEO': {
      searches: [
        { engine: 'google',  q: 'SaaS startup no blog no SEO content site:producthunt.com/products' },
        { engine: 'google',  q: 'small business website low Google ranking no SEO -agency' },
      ],
    },
    'Funnel Building': {
      searches: [
        { engine: 'google',  q: 'coach consultant no booking funnel no sales page site:linkedin.com/in -recruiter' },
        { engine: 'google',  q: 'online coach no landing page selling via DM only -agency' },
      ],
    },
    'Graphic Design': {
      searches: [
        { engine: 'google',  q: 'e-commerce store poor product images no brand identity clothing beauty -blog -list' },
        { engine: 'google',  q: 'small business no logo no branding inconsistent visuals -agency -template' },
      ],
    },
    'Voice Over': {
      searches: [
        { engine: 'youtube', q: 'educational explainer animation tutorial channel', maxSubs: 80000 },
        { engine: 'google',  q: 'YouTube educational channel needs voice over explainer video -agency' },
      ],
    },
    'Paid Ads': {
      searches: [
        { engine: 'google',  q: 'e-commerce store running ads no landing page poor conversion -blog -list' },
        { engine: 'google',  q: 'small business spending on ads no proper funnel -agency' },
      ],
    },
    'Content Writing': {
      searches: [
        { engine: 'google',  q: 'SaaS startup no blog no content marketing site:producthunt.com/products' },
        { engine: 'google',  q: 'company blog inactive last post 6 months ago no content strategy -agency' },
      ],
    },
  };
 
  // Helper: run a YouTube channel search
  async function searchYouTube(q, maxSubs = 200000) {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=20&relevanceLanguage=en&key=${YOUTUBE}`;
    const searchRes  = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.error || !searchData.items?.length) return [];
 
    const ids = searchData.items.map(i => i.id?.channelId).filter(Boolean).join(',');
    if (!ids) return [];
 
    const detailRes  = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ids}&key=${YOUTUBE}`);
    const detailData = await detailRes.json();
 
    return (detailData.items || [])
      .filter(ch => {
        const title = (ch.snippet?.title || '').toLowerCase();
        const subs  = parseInt(ch.statistics?.subscriberCount || 0);
        return !title.includes('- topic') &&
          !title.includes('vevo') &&
          !title.includes(' - music') &&
          subs >= 500 &&
          subs <= maxSubs;
      })
      .map(ch => {
        const subs = parseInt(ch.statistics?.subscriberCount || 0);
        return {
          name:            ch.snippet?.title,
          description:     ch.snippet?.description?.slice(0, 300),
          subscribers:     subs >= 1000000 ? `${(subs/1000000).toFixed(1)}M subscribers` : `${(subs/1000).toFixed(1)}k subscribers`,
          subscriberCount: subs,
          videoCount:      ch.statistics?.videoCount,
          country:         ch.snippet?.country,
          profileUrl:      ch.snippet?.customUrl ? `https://youtube.com/${ch.snippet.customUrl}` : `https://youtube.com/channel/${ch.id}`,
          platform:        'YouTube',
        };
      });
  }
 
  // Helper: run a SerpApi Google search
  async function searchGoogle(q, extraFilter = '') {
    const finalQ = extraFilter ? `${q} ${extraFilter}` : q;
    const url    = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(finalQ)}&num=10&api_key=${SERP}`;
    const sRes   = await fetch(url);
    const sData  = await sRes.json();
    return (sData.organic_results || [])
      .filter(r => {
        const l = (r.link || '').toLowerCase();
        return !l.includes('/blog/') && !l.includes('/articles/') &&
               !l.includes('top-10') && !l.includes('bestof') &&
               !l.includes('omegatheme') && !l.includes('oberlo');
      })
      .slice(0, 8)
      .map(r => ({
        name:     r.title,
        link:     r.link,
        snippet:  r.snippet,
        platform: r.link?.includes('instagram.com') ? 'Instagram'
                : r.link?.includes('linkedin.com')  ? 'LinkedIn'
                : r.link?.includes('youtube.com')   ? 'YouTube'
                : r.link?.includes('tiktok.com')    ? 'TikTok'
                : 'Website',
      }));
  }
 
  // Helper: run a SerpApi Google Maps search
  async function searchMaps(q) {
    const url  = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(q)}&type=search&api_key=${SERP}`;
    const sRes = await fetch(url);
    const sData = await sRes.json();
    return (sData.local_results || []).slice(0, 10).map(r => ({
      name: r.title, rating: r.rating, reviews: r.reviews,
      type: r.type, address: r.address, phone: r.phone,
      website: r.website, platform: 'Google Maps',
    }));
  }
 
  try {
 
    // ─────────────────────────────────────────────────────────
    // STEP 1 — SCRAPE
    // ─────────────────────────────────────────────────────────
 
    if (mode === 'quick' && skill) {
      const cfg          = skillConfig[skill];
      const locationPart = prompt.includes(' in ') ? prompt.split(' in ').slice(1).join(' in ') : '';
 
      if (cfg) {
        // Run all configured searches for this skill
        for (const search of cfg.searches) {
          if (rawProfiles.length >= 6) break;
          const q = locationPart ? `${search.q} ${locationPart}` : search.q;
          try {
            if (search.engine === 'youtube' && YOUTUBE) {
              const ytP = await searchYouTube(q, search.maxSubs || 200000);
              rawProfiles = [...rawProfiles, ...ytP];
            } else if (search.engine === 'maps') {
              const mapsQ = locationPart ? `${q} ${locationPart}` : q;
              const mP   = await searchMaps(mapsQ);
              rawProfiles = [...rawProfiles, ...mP];
            } else {
              const gP = await searchGoogle(q);
              rawProfiles = [...rawProfiles, ...gP];
            }
          } catch (e) {
            console.error(`Search error (${search.engine}):`, e.message);
          }
        }
      } else {
        // "Other" skill — use prompt directly
        try {
          rawProfiles = await searchGoogle(prompt);
        } catch (e) {
          console.error('Other skill search error:', e);
        }
      }
 
    } else {
      // Deep scan mode
      if (type === 'Content Creators') {
        if (platform === 'youtube' || platform === 'all') {
          try {
            const ytP = await searchYouTube(`${prompt} -topic -music -vevo`, 500000);
            rawProfiles = [...rawProfiles, ...ytP];
          } catch (e) { apiWarning = `YouTube: ${e.message}`; }
        }
        if (platform === 'instagram' || platform === 'all') {
          try {
            const gP = await searchGoogle(`${prompt} -agency -brand site:instagram.com`);
            rawProfiles = [...rawProfiles, ...gP.filter(r => (r.link||'').includes('instagram.com/') && !(r.link||'').includes('/p/'))];
          } catch (e) {}
        }
        if (platform === 'tiktok') {
          try {
            const gP = await searchGoogle(`${prompt} site:tiktok.com/@`);
            rawProfiles = [...rawProfiles, ...gP.filter(r => (r.link||'').includes('tiktok.com/@'))];
          } catch (e) {}
        }
        if (platform === 'linkedin') {
          try {
            const gP = await searchGoogle(`${prompt} creator site:linkedin.com/in`);
            rawProfiles = [...rawProfiles, ...gP.filter(r => (r.link||'').includes('linkedin.com/in/'))];
          } catch (e) {}
        }
      } else if (type === 'Local Businesses') {
        try { rawProfiles = await searchMaps(prompt); } catch (e) {}
        if (rawProfiles.length === 0) {
          try { rawProfiles = await searchGoogle(prompt + ' local business'); } catch (e) {}
        }
      } else if (type === 'Startups') {
        try {
          const gP = await searchGoogle(prompt + ' site:producthunt.com/products');
          rawProfiles = gP.filter(r => (r.link||'').includes('producthunt.com'));
        } catch (e) {}
        if (rawProfiles.length === 0) {
          try { rawProfiles = await searchGoogle(prompt + ' startup saas'); } catch (e) {}
        }
      } else if (type === 'E-commerce Brands') {
        try {
          rawProfiles = await searchGoogle(`${prompt} online store -blog -"top 10" -theme -template`);
        } catch (e) {}
        if (rawProfiles.length === 0) {
          try { rawProfiles = await searchGoogle(prompt + ' ecommerce store brand'); } catch (e) {}
        }
      } else if (type === 'Coaches & Consultants') {
        try {
          const gP = await searchGoogle(`${prompt} site:linkedin.com/in -recruiter -hiring`);
          rawProfiles = gP.filter(r => (r.link||'').includes('linkedin.com/in/'));
        } catch (e) {}
        if (rawProfiles.length === 0) {
          try { rawProfiles = await searchGoogle(prompt + ' coach consultant'); } catch (e) {}
        }
      }
    }
 
    console.log(`[OppEngine] mode=${mode} skill=${skill} profiles=${rawProfiles.length}`);
 
    if (rawProfiles.length === 0) {
      return res.status(200).json({
        leads: [], source: 'live', empty: true,
        warning: apiWarning || 'No profiles found. Try a different skill or location.',
      });
    }
 
    // ─────────────────────────────────────────────────────────
    // STEP 2 — GROQ: Analyse → leads
    // ─────────────────────────────────────────────────────────
    const incomeContext = incomeGoal
      ? `The freelancer wants to earn around $${incomeGoal}/month. Estimate deal values accordingly and prioritise leads most likely to pay that rate.`
      : '';
 
    const skillContext = skill
      ? `The freelancer's skill is: ${skill}. Only pick leads who SPECIFICALLY need this skill. Their problem must be directly solvable by ${skill}.`
      : '';
 
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        messages: [{
          role: 'user',
          content: `You are a freelance client-finder for a tool called Lancify. Your job is to find the best paying clients for a beginner freelancer.
 
${skillContext}
${incomeContext}
Target: ${type} | Platform: ${platform === 'all' ? 'any' : platform}
Search context: ${prompt}
 
Here are ${rawProfiles.length} REAL leads from live search:
${JSON.stringify(rawProfiles.slice(0, 8), null, 2)}
 
RULES:
- Pick only REAL businesses or creators from the data — no agencies, no blogs, no listicles
- Each lead must have a clear problem that the freelancer's skill directly solves
- Use REAL name and REAL URL from the data — never invent profile URLs
- Keep language simple and beginner-friendly — no jargon
- followers/audience: use real data or "Not listed"
- redFlag: a specific warning OR JSON null — never the string "null"
- dealValue: realistic price for a beginner freelancer (not too high, not too low)
 
Return top 3 as a JSON array:
{
  "name": "real name",
  "platform": "YouTube / Instagram / LinkedIn / Google Maps / Shopify / TikTok / Website",
  "followers": "audience size or 'Not listed'",
  "problem": "their specific problem in plain English — 1 sentence",
  "strategy": "how to reach out to them — simple and direct",
  "match": <integer 80-99>,
  "reason": "why this is a good lead for someone with this skill",
  "whyNow": "why reach out THIS WEEK",
  "redFlag": null,
  "closingHint": "simple closing tip for a beginner",
  "replyChance": <integer 35-90>,
  "jobDesc": "what job they would post on Upwork",
  "profileUrl": "exact URL from data — never make this up",
  "dealValue": "realistic price e.g. '$200 – $500'"
}
 
Return ONLY the raw JSON array. No explanation. No markdown. No code fences.`,
        }],
      }),
    });
 
    const groqData = await groqRes.json();
    const rawText  = groqData?.choices?.[0]?.message?.content || '[]';
 
    let leads = [];
    try { leads = JSON.parse(rawText); } catch { leads = []; }
 
    leads = leads.map(l => ({
      ...l,
      redFlag:   (!l.redFlag || ['null','None','none','N/A',''].includes(String(l.redFlag))) ? null : l.redFlag,
      followers: (!l.followers || ['no data','N/A','undefined','null','Not Available'].includes(String(l.followers))) ? 'Not listed' : l.followers,
    }));
 
    return res.status(200).json({ leads, source: 'live', count: leads.length, warning: apiWarning || null });
 
  } catch (err) {
    console.error('Opportunity Engine fatal error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [], source: 'error' });
  }
}
