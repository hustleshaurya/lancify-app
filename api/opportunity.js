// api/opportunity.js
// Opportunity Engine — Quick Find (skill-based) + Deep Scan
// APIs: YouTube Data API v3 + SerpApi + Groq

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    type     = 'Local Businesses',
    prompt   = '',
    signals  = [],
    budget   = [],
    platform = 'all',
    skill    = null,
    mode     = 'deep',
  } = req.body;

  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const SERP    = process.env.SERPAPI_KEY;
  const GROQ    = process.env.GROQ_API_KEY;
  const YOUTUBE = process.env.YOUTUBE_API_KEY;

  let rawProfiles = [];
  let apiWarning  = null;

  // ─────────────────────────────────────────────────────────
  // SKILL MAP — Quick Find maps skill → precise search config
  // ─────────────────────────────────────────────────────────
  const skillSearchMap = {
    'Thumbnail Design': {
      serpQuery: 'YouTube channel fitness OR cooking OR education bad thumbnails under 100k subscribers',
      ytQuery:   'fitness cooking education tutorial channel',
      maxSubs:   200000,
    },
    'Video Editing': {
      serpQuery: 'YouTube vlog lifestyle travel daily channel inconsistent uploads under 50k',
      ytQuery:   'vlog lifestyle travel daily channel',
      maxSubs:   100000,
    },
    'Copywriting': {
      serpQuery: 'Shopify store clothing beauty fitness weak product description no CTA',
      ytQuery:   null,
    },
    'Email Marketing': {
      serpQuery: 'coach consultant business no newsletter no email list site:linkedin.com/in',
      ytQuery:   null,
    },
    'Social Media Management': {
      serpQuery: 'local business restaurant salon gym inactive Instagram dead social media',
      ytQuery:   null,
    },
    'Web Design': {
      serpQuery: 'local business restaurant shop clinic outdated website no mobile version',
      ytQuery:   null,
    },
    'SEO': {
      serpQuery: 'SaaS startup no blog no content marketing site:producthunt.com',
      ytQuery:   null,
    },
    'Funnel Building': {
      serpQuery: 'coach consultant no booking page no sales funnel site:linkedin.com/in',
      ytQuery:   null,
    },
    'Graphic Design': {
      serpQuery: 'e-commerce brand poor product images no brand identity online store',
      ytQuery:   null,
    },
    'Voice Over': {
      serpQuery: 'YouTube educational explainer animation channel under 50k subscribers',
      ytQuery:   'educational explainer animation tutorial channel',
      maxSubs:   100000,
    },
    'Paid Ads': {
      serpQuery: 'e-commerce brand running ads no landing page poor ROAS online store',
      ytQuery:   null,
    },
    'Content Writing': {
      serpQuery: 'SaaS startup no blog no case studies no content marketing site:producthunt.com',
      ytQuery:   null,
    },
  };

  try {

    // ─────────────────────────────────────────────────────────
    // STEP 1 — SCRAPE REAL DATA
    // ─────────────────────────────────────────────────────────

    // ══ QUICK FIND MODE ══
    if (mode === 'quick' && skill && skillSearchMap[skill]) {
      const cfg = skillSearchMap[skill];
      const locationPart = prompt.includes(' in ') ? prompt.split(' in ').slice(1).join(' in ') : '';

      // YouTube for video skills
      if (cfg.ytQuery && YOUTUBE) {
        try {
          const q         = locationPart ? `${cfg.ytQuery} ${locationPart}` : cfg.ytQuery;
          const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=20&relevanceLanguage=en&key=${YOUTUBE}`;
          const searchRes = await fetch(searchUrl);
          const searchData = await searchRes.json();

          if (!searchData.error && searchData.items?.length > 0) {
            const ids = searchData.items.map(i => i.id?.channelId).filter(Boolean).join(',');
            if (ids) {
              const detailUrl  = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ids}&key=${YOUTUBE}`;
              const detailRes  = await fetch(detailUrl);
              const detailData = await detailRes.json();
              const maxSubs    = cfg.maxSubs || 500000;

              rawProfiles = (detailData.items || [])
                .filter(ch => {
                  const title = (ch.snippet?.title || '').toLowerCase();
                  const subs  = parseInt(ch.statistics?.subscriberCount || 0);
                  return !title.includes('- topic') &&
                    !title.includes('vevo') &&
                    !title.includes('music') &&
                    subs >= 500 &&
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
                    videoCount:      ch.statistics?.videoCount,
                    country:         ch.snippet?.country,
                    profileUrl:      ch.snippet?.customUrl
                      ? `https://youtube.com/${ch.snippet.customUrl}`
                      : `https://youtube.com/channel/${ch.id}`,
                    platform: 'YouTube',
                  };
                });
            }
          }
        } catch (e) {
          apiWarning = `YouTube error: ${e.message}`;
          console.error('YT Quick error:', e);
        }
      }

      // SerpApi for all skills as primary or supplement
      if (rawProfiles.length < 3 && cfg.serpQuery) {
        try {
          const q    = locationPart ? `${cfg.serpQuery} ${locationPart}` : cfg.serpQuery;
          const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=10&api_key=${SERP}`;
          const sRes = await fetch(url);
          const sData = await sRes.json();
          const extras = (sData.organic_results || [])
            .filter(r => {
              const l = (r.link || '').toLowerCase();
              return !l.includes('/blog/') && !l.includes('articles') &&
                     !l.includes('top-10') && !l.includes('best-');
            })
            .slice(0, 8)
            .map(r => ({
              name:     r.title,
              link:     r.link,
              snippet:  r.snippet,
              platform: r.link?.includes('instagram.com') ? 'Instagram'
                      : r.link?.includes('linkedin.com')  ? 'LinkedIn'
                      : r.link?.includes('youtube.com')   ? 'YouTube'
                      : 'Website',
            }));
          rawProfiles = [...rawProfiles, ...extras];
        } catch (e) {
          console.error('SerpApi quick error:', e);
        }
      }

    // ══ DEEP SCAN MODE ══
    } else {

      if (type === 'Content Creators') {

        if (platform === 'youtube' || platform === 'all') {
          try {
            const q         = `${prompt} -topic -music -vevo -rapper -singer`;
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=15&relevanceLanguage=en&key=${YOUTUBE}`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (!searchData.error && searchData.items?.length > 0) {
              const ids = searchData.items.map(i => i.id?.channelId).filter(Boolean).join(',');
              if (ids) {
                const detailRes  = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ids}&key=${YOUTUBE}`);
                const detailData = await detailRes.json();
                const ytP = (detailData.items || [])
                  .filter(ch => {
                    const title = (ch.snippet?.title || '').toLowerCase();
                    const subs  = parseInt(ch.statistics?.subscriberCount || 0);
                    return !title.includes('- topic') && !title.includes('vevo') && subs > 100;
                  })
                  .map(ch => {
                    const subs = parseInt(ch.statistics?.subscriberCount || 0);
                    const fmt  = subs >= 1000000
                      ? `${(subs/1000000).toFixed(1)}M subscribers`
                      : subs >= 1000
                      ? `${(subs/1000).toFixed(1)}k subscribers`
                      : `${subs} subscribers`;
                    return {
                      name: ch.snippet?.title,
                      description: ch.snippet?.description?.slice(0, 300),
                      subscribers: fmt,
                      subscriberCount: subs,
                      videoCount: ch.statistics?.videoCount,
                      country: ch.snippet?.country,
                      profileUrl: ch.snippet?.customUrl
                        ? `https://youtube.com/${ch.snippet.customUrl}`
                        : `https://youtube.com/channel/${ch.id}`,
                      platform: 'YouTube',
                    };
                  });
                rawProfiles = [...rawProfiles, ...ytP];
              }
            }
          } catch (e) { apiWarning = `YouTube: ${e.message}`; }
        }

        if (platform === 'instagram' || platform === 'all') {
          try {
            const q    = `${prompt} -agency -brand -marketing site:instagram.com`;
            const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=8&api_key=${SERP}`;
            const sRes = await fetch(url);
            const sData = await sRes.json();
            const igP  = (sData.organic_results || [])
              .filter(r => {
                const l = r.link || '';
                return l.includes('instagram.com/') && !l.includes('/p/') && !l.includes('/reel/');
              })
              .map(r => ({
                name: r.title?.replace(' • Instagram photos and videos','').replace(' • Instagram','').split('(')[0].trim(),
                description: r.snippet,
                profileUrl: r.link,
                platform: 'Instagram',
              }));
            rawProfiles = [...rawProfiles, ...igP];
          } catch (e) { console.error('IG error:', e); }
        }

        if (platform === 'tiktok') {
          try {
            const q    = `${prompt} -agency -brand site:tiktok.com/@`;
            const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=8&api_key=${SERP}`;
            const sRes = await fetch(url);
            const sData = await sRes.json();
            const ttP  = (sData.organic_results || [])
              .filter(r => (r.link||'').includes('tiktok.com/@'))
              .map(r => ({ name: r.title?.replace(' | TikTok','').trim(), description: r.snippet, profileUrl: r.link, platform: 'TikTok' }));
            rawProfiles = [...rawProfiles, ...ttP];
          } catch (e) { console.error('TT error:', e); }
        }

        if (platform === 'linkedin') {
          try {
            const q    = `${prompt} creator site:linkedin.com/in`;
            const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=8&api_key=${SERP}`;
            const sRes = await fetch(url);
            const sData = await sRes.json();
            const liP  = (sData.organic_results || [])
              .filter(r => (r.link||'').includes('linkedin.com/in/'))
              .map(r => ({ name: r.title?.replace(' | LinkedIn','').trim(), description: r.snippet, profileUrl: r.link, platform: 'LinkedIn' }));
            rawProfiles = [...rawProfiles, ...liP];
          } catch (e) { console.error('LI creator error:', e); }
        }

      } else if (type === 'Local Businesses') {
        try {
          const url  = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(prompt)}&type=search&api_key=${SERP}`;
          const sRes = await fetch(url);
          const sData = await sRes.json();
          rawProfiles = (sData.local_results || []).slice(0, 10).map(r => ({
            name: r.title, rating: r.rating, reviews: r.reviews,
            type: r.type, address: r.address, phone: r.phone,
            website: r.website, platform: 'Google Maps',
          }));
        } catch (e) { console.error('Maps error:', e); }

        if (rawProfiles.length === 0) {
          try {
            const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' local business')}&num=10&api_key=${SERP}`;
            const sRes = await fetch(url);
            const sData = await sRes.json();
            rawProfiles = (sData.organic_results || []).slice(0, 8).map(r => ({
              name: r.title, link: r.link, snippet: r.snippet, platform: 'Website',
            }));
          } catch (e) {}
        }

      } else if (type === 'Startups') {
        try {
          const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' site:producthunt.com/products')}&num=10&api_key=${SERP}`;
          const sRes = await fetch(url);
          const sData = await sRes.json();
          rawProfiles = (sData.organic_results || [])
            .filter(r => (r.link||'').includes('producthunt.com'))
            .map(r => ({ name: r.title, link: r.link, snippet: r.snippet, platform: 'Product Hunt' }));
        } catch (e) { console.error('PH error:', e); }

        if (rawProfiles.length === 0) {
          try {
            const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' startup saas')}&num=10&api_key=${SERP}`;
            const sRes = await fetch(url);
            const sData = await sRes.json();
            rawProfiles = (sData.organic_results || []).slice(0, 8).map(r => ({
              name: r.title, link: r.link, snippet: r.snippet, platform: 'Website',
            }));
          } catch (e) {}
        }

      } else if (type === 'E-commerce Brands') {
        try {
          const q    = `${prompt} online store -blog -"top 10" -theme -template -list`;
          const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=10&api_key=${SERP}`;
          const sRes = await fetch(url);
          const sData = await sRes.json();
          rawProfiles = (sData.organic_results || [])
            .filter(r => { const l = (r.link||'').toLowerCase(); return !l.includes('/blog/') && !l.includes('oberlo') && !l.includes('omegatheme'); })
            .map(r => ({ name: r.title, link: r.link, snippet: r.snippet, platform: 'E-commerce' }));
        } catch (e) { console.error('EC error:', e); }

        if (rawProfiles.length === 0) {
          try {
            const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' ecommerce brand store')}&num=10&api_key=${SERP}`;
            const sRes = await fetch(url);
            const sData = await sRes.json();
            rawProfiles = (sData.organic_results || []).slice(0, 8).map(r => ({
              name: r.title, link: r.link, snippet: r.snippet, platform: 'E-commerce',
            }));
          } catch (e) {}
        }

      } else if (type === 'Coaches & Consultants') {
        try {
          const q    = `${prompt} site:linkedin.com/in -recruiter -hiring -jobs`;
          const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=10&api_key=${SERP}`;
          const sRes = await fetch(url);
          const sData = await sRes.json();
          rawProfiles = (sData.organic_results || [])
            .filter(r => (r.link||'').includes('linkedin.com/in/'))
            .map(r => ({ name: r.title?.replace(' | LinkedIn','').trim(), link: r.link, snippet: r.snippet, platform: 'LinkedIn' }));
        } catch (e) { console.error('LI error:', e); }

        if (rawProfiles.length === 0) {
          try {
            const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' coach consultant')}&num=10&api_key=${SERP}`;
            const sRes = await fetch(url);
            const sData = await sRes.json();
            rawProfiles = (sData.organic_results || []).slice(0, 8).map(r => ({
              name: r.title, link: r.link, snippet: r.snippet, platform: 'Website',
            }));
          } catch (e) {}
        }
      }
    }

    console.log(`[OppEngine] mode=${mode} skill=${skill} type=${type} profiles=${rawProfiles.length}`);

    // ─────────────────────────────────────────────────────────
    // STEP 2 — Return empty early if nothing found
    // ─────────────────────────────────────────────────────────
    if (rawProfiles.length === 0) {
      return res.status(200).json({
        leads: [], source: 'live', empty: true,
        warning: apiWarning || 'No profiles found. Try a broader search.',
      });
    }

    // ─────────────────────────────────────────────────────────
    // STEP 3 — GROQ: Analyse profiles → structured leads
    // ─────────────────────────────────────────────────────────
    const skillContext = skill
      ? `The freelancer's skill is: ${skill}. Find leads who SPECIFICALLY need this skill.`
      : '';

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        messages: [{
          role: 'user',
          content: `You are an expert freelance opportunity analyser for Lancify.

${skillContext}
Target: ${type} | Platform: ${platform === 'all' ? 'any' : platform}
Search: ${prompt}
Pain signals: ${signals.join(', ') || 'any'}

Here are ${rawProfiles.length} REAL profiles from live search:
${JSON.stringify(rawProfiles.slice(0, 8), null, 2)}

STRICT RULES:
- Only pick REAL individual creators or businesses from the data above
- Ignore agencies, blogs, listicles, theme sites, marketing companies
- Pick profiles with a clear problem the freelancer's skill solves
- Use REAL name and REAL profileUrl from data — NEVER invent URLs
- followers: real data or "Not listed" — never "no data" or "N/A"
- redFlag: specific warning string OR JSON null — NEVER the text "null"
- For YouTube: reference subscriber count and video count as evidence of the problem

Return top 3 as JSON array with EXACTLY these keys:
{
  "name": "real name from data",
  "platform": "YouTube / Instagram / LinkedIn / Google Maps / Shopify / TikTok / Website",
  "followers": "real audience size e.g. '14.2k subscribers' or 'Not listed'",
  "problem": "specific problem from real data — cite actual evidence",
  "strategy": "exact outreach strategy for this specific person",
  "match": <integer 80-99>,
  "reason": "one sentence why this score",
  "whyNow": "one sentence — why reach out THIS WEEK",
  "redFlag": null,
  "closingHint": "one sentence closing strategy",
  "replyChance": <integer 35-90>,
  "jobDesc": "job description as if posted on Upwork",
  "profileUrl": "exact URL from data — never invent this"
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
      followers: (!l.followers || ['no data','N/A','undefined','null'].includes(String(l.followers))) ? 'Not listed' : l.followers,
    }));

    return res.status(200).json({ leads, source: 'live', count: leads.length, warning: apiWarning || null });

  } catch (err) {
    console.error('Opportunity Engine fatal error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [], source: 'error' });
  }
}
