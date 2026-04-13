// api/opportunity.js
// Opportunity Engine — Apify (Maps/Instagram) + SerpApi (YouTube/LinkedIn/Web) + Groq
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

  const SERP  = process.env.SERPAPI_KEY;
  const GROQ  = process.env.GROQ_API_KEY;
  const APIFY = process.env.APIFY_API_TOKEN;

  let rawProfiles = [];

  // ─────────────────────────────────────────────────────────
  // SKILL → SEARCH CONFIG
  // Each skill defines exactly what kind of CLIENT to find
  // and where to find them — not platforms/tools/agencies
  // ─────────────────────────────────────────────────────────
  const SKILL_CONFIG = {
    'Thumbnail Design': {
      serpQueries: [
        'inurl:youtube.com/@  fitness OR cooking OR education channel under 50k subscribers',
        'site:youtube.com "@" fitness tutorial channel -vevo -topic',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['fiverr','upwork','veed','canva','agency','tool','software','app','platform','hire','freelance'],
    },
    'Video Editing': {
      serpQueries: [
        'site:youtube.com "@" vlog OR lifestyle OR travel channel -vevo -topic',
        'site:instagram.com fitness OR travel OR food content creator -agency',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['fiverr','upwork','veed','agency','tool','software','platform'],
    },
    'Copywriting': {
      serpQueries: [
        'site:myshopify.com clothing OR beauty OR fitness store',
        'small business website bad copy no clear value proposition -agency -template',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['fiverr','upwork','blog','list','top 10','agency','template','theme'],
    },
    'Email Marketing': {
      serpQueries: [
        'site:linkedin.com/in coach OR consultant -recruiter -hiring -jobs',
        'online coach no email list no newsletter -agency',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['fiverr','upwork','mailchimp','klaviyo','agency','tool','platform'],
    },
    'Social Media Management': {
      serpQueries:  null,
      apifyMaps:   'restaurant OR cafe OR salon OR gym OR fitness studio',
      apifyIG:     null,
      exclude:     ['agency','management company','marketing firm'],
    },
    'Web Design': {
      serpQueries:  null,
      apifyMaps:   'local business shop clinic dentist lawyer',
      apifyIG:     null,
      exclude:     ['agency','web design company','wix','squarespace','template'],
    },
    'SEO': {
      serpQueries: [
        'site:producthunt.com/products saas startup no blog',
        'small business website low traffic no SEO blog -agency',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['agency','tool','platform','semrush','ahrefs'],
    },
    'Funnel Building': {
      serpQueries: [
        'site:linkedin.com/in life coach OR business coach OR fitness coach -recruiter',
        'online coach no sales page no booking funnel -agency',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['clickfunnels','agency','tool','platform','software'],
    },
    'Graphic Design': {
      serpQueries: [
        'site:myshopify.com clothing OR beauty OR accessories brand',
        'small ecommerce brand poor product images no brand identity -agency',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['canva','fiverr','upwork','agency','template','tool'],
    },
    'Voice Over': {
      serpQueries: [
        'site:youtube.com "@" educational OR explainer OR animation channel -vevo -topic',
        'youtube educational explainer channel needs voice over under 100k subscribers',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['fiverr','upwork','voices.com','agency','studio'],
    },
    'Paid Ads': {
      serpQueries: [
        'site:myshopify.com ecommerce store running ads no proper landing page',
        'small business running Facebook ads no funnel -agency',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['agency','facebook','google ads','tool','platform'],
    },
    'Content Writing': {
      serpQueries: [
        'site:producthunt.com/products saas startup no blog no content',
        'company blog inactive no content marketing -agency',
      ],
      apifyMaps:   null,
      apifyIG:     null,
      exclude:     ['fiverr','upwork','agency','tool','platform','jasper','copy.ai'],
    },
  };

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────

  // Run Apify Google Maps scraper
  async function runApifyMaps(query, location = '') {
    if (!APIFY) return [];
    const finalQuery = location ? `${query} in ${location}` : query;
    try {
      const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${APIFY}&timeout=50`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchStringsArray: [finalQuery],
          maxCrawledPlacesPerSearch: 8,
          language: 'en',
        }),
      });
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.slice(0, 8).map(item => ({
        name:        item.title,
        description: `${item.categoryName || ''} | Rating: ${item.totalScore || 'N/A'} | Reviews: ${item.reviewsCount || 0} | ${item.address || ''}`,
        rating:      item.totalScore,
        reviews:     item.reviewsCount,
        phone:       item.phone,
        website:     item.website,
        profileUrl:  item.website || item.url || null,
        platform:    'Google Maps',
      }));
    } catch (e) {
      console.error('Apify Maps error:', e.message);
      return [];
    }
  }

  // Run SerpApi Google search — filtered to avoid platforms/tools
  async function runSerpGoogle(query, excludeTerms = []) {
    if (!SERP) return [];
    const finalQ = excludeTerms.length > 0
      ? `${query} ${excludeTerms.map(t => `-"${t}"`).join(' ')}`
      : query;
    try {
      const url  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(finalQ)}&num=10&api_key=${SERP}`;
      const res  = await fetch(url);
      const data = await res.json();
      return (data.organic_results || [])
        .filter(r => {
          const link = (r.link || '').toLowerCase();
          const title = (r.title || '').toLowerCase();
          // Hard filter — remove any result that is a tool/platform/agency/blog
          const badTerms = ['fiverr','upwork','freelancer.com','veed','canva','agency','tool','software',
            'platform','hire','blog','list','top 10','best ','template','theme','how to','oberlo',
            'shopify.com/blog','omegatheme','marketing company','design company'];
          return !badTerms.some(t => link.includes(t) || title.includes(t));
        })
        .slice(0, 8)
        .map(r => ({
          name:        r.title,
          description: r.snippet,
          profileUrl:  r.link,
          platform:    r.link?.includes('youtube.com')   ? 'YouTube'
                     : r.link?.includes('instagram.com') ? 'Instagram'
                     : r.link?.includes('linkedin.com')  ? 'LinkedIn'
                     : r.link?.includes('tiktok.com')    ? 'TikTok'
                     : r.link?.includes('myshopify.com') ? 'Shopify'
                     : r.link?.includes('producthunt.com')? 'Product Hunt'
                     : 'Website',
        }));
    } catch (e) {
      console.error('SerpApi error:', e.message);
      return [];
    }
  }

  // Run SerpApi Google Maps
  async function runSerpMaps(query) {
    if (!SERP) return [];
    try {
      const url  = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&type=search&api_key=${SERP}`;
      const res  = await fetch(url);
      const data = await res.json();
      return (data.local_results || []).slice(0, 8).map(r => ({
        name:        r.title,
        description: `${r.type || ''} | Rating: ${r.rating || 'N/A'} | Reviews: ${r.reviews || 0} | ${r.address || ''}`,
        rating:      r.rating,
        reviews:     r.reviews,
        phone:       r.phone,
        website:     r.website,
        profileUrl:  r.website || null,
        platform:    'Google Maps',
      }));
    } catch (e) {
      console.error('SerpApi Maps error:', e.message);
      return [];
    }
  }

  try {

    // ─────────────────────────────────────────────────────────
    // STEP 1 — SCRAPE BASED ON SKILL OR TYPE
    // ─────────────────────────────────────────────────────────

    const cfg      = skill ? SKILL_CONFIG[skill] : null;
    const location = prompt.includes(' in ') ? prompt.split(' in ').slice(1).join(' in ') : '';

    if (mode === 'quick' && cfg) {
      // ── QUICK FIND: skill-based targeted scraping ──

      // Maps-based skills (Social Media, Web Design)
      if (cfg.apifyMaps) {
        const mapsQuery = location ? `${cfg.apifyMaps} in ${location}` : cfg.apifyMaps;

        // Try Apify Maps first
        rawProfiles = await runApifyMaps(mapsQuery, '');

        // Fallback to SerpApi Maps if Apify times out or returns empty
        if (rawProfiles.length === 0) {
          rawProfiles = await runSerpMaps(mapsQuery);
        }
      }

      // SerpApi-based skills
      if (rawProfiles.length < 3 && cfg.serpQueries) {
        for (const q of cfg.serpQueries) {
          if (rawProfiles.length >= 6) break;
          const locationQ = location ? `${q} ${location}` : q;
          const results   = await runSerpGoogle(locationQ, cfg.exclude || []);
          rawProfiles = [...rawProfiles, ...results];
        }
      }

      // Custom "other" skill
      if (!cfg && skill) {
        const customQ = location ? `${skill} client ${location} -agency -fiverr -upwork` : `${skill} small business OR creator needing ${skill} -agency -fiverr -upwork`;
        rawProfiles = await runSerpGoogle(customQ);
      }

    } else {
      // ── DEEP SCAN: type-based scraping ──

      if (type === 'Local Businesses') {
        rawProfiles = await runApifyMaps(prompt, '');
        if (rawProfiles.length === 0) rawProfiles = await runSerpMaps(prompt);
        if (rawProfiles.length === 0) rawProfiles = await runSerpGoogle(prompt + ' local business -agency');

      } else if (type === 'Content Creators') {
        const platQ = platform === 'instagram' ? `site:instagram.com ${prompt} -agency`
                    : platform === 'tiktok'    ? `site:tiktok.com/@ ${prompt} -agency`
                    : platform === 'linkedin'   ? `site:linkedin.com/in ${prompt} creator`
                    : `site:youtube.com "@ " ${prompt} channel -vevo -topic`;
        rawProfiles = await runSerpGoogle(platQ);

      } else if (type === 'Startups') {
        const r1 = await runSerpGoogle(`site:producthunt.com/products ${prompt}`);
        rawProfiles = r1.length > 0 ? r1 : await runSerpGoogle(`${prompt} startup saas -agency`);

      } else if (type === 'E-commerce Brands') {
        const r1 = await runSerpGoogle(`site:myshopify.com ${prompt} -blog -list -template`);
        rawProfiles = r1.length > 0 ? r1 : await runSerpGoogle(`${prompt} ecommerce store -blog -agency -list`);

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
        warning: 'No clients found. Try a different location or broader skill.',
      });
    }

    // ─────────────────────────────────────────────────────────
    // STEP 2 — GROQ: Turn raw data into actionable leads
    // ─────────────────────────────────────────────────────────
    const skillContext  = skill ? `Freelancer skill: ${skill}. Find leads who NEED this exact skill.` : '';
    const incomeContext = incomeGoal ? `Freelancer income goal: $${incomeGoal}/month. Price deals accordingly.` : '';

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

Here are REAL scraped profiles:
${JSON.stringify(rawProfiles.slice(0, 8), null, 2)}

CRITICAL RULES:
- ONLY pick actual businesses, creators, or individuals who could hire a freelancer
- NEVER pick: Fiverr, Upwork, Veed, Canva, agencies, tools, software platforms, freelance marketplaces, blog posts, listicles, or "how to hire" articles
- Each lead must be someone a freelancer can directly DM or email
- Use REAL name and REAL profileUrl from data — never invent URLs
- redFlag: specific warning string OR JSON null — NEVER the text "null"
- followers: real data or "Not listed"
- dealValue: realistic beginner price e.g. "$150 – $400"
- problem: ONE sentence, plain English, specific to their situation
- strategy: ONE sentence on exactly how to contact them

Return top 3 as JSON array:
[{
  "name": "real business or person name",
  "platform": "YouTube / Instagram / LinkedIn / Google Maps / Shopify / Website",
  "followers": "audience size or 'Not listed'",
  "problem": "their specific problem in 1 plain sentence",
  "strategy": "exactly how to contact and pitch them in 1 sentence",
  "match": <80-99>,
  "reason": "why this is a good client for this skill",
  "whyNow": "why reach out this week specifically",
  "redFlag": null,
  "closingHint": "simple closing tip",
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
    } catch {
      leads = [];
    }

    // Clean bad values
    leads = leads.map(l => ({
      ...l,
      redFlag:   (!l.redFlag || ['null','None','none','N/A',''].includes(String(l.redFlag))) ? null : l.redFlag,
      followers: (!l.followers || ['no data','N/A','undefined','null'].includes(String(l.followers))) ? 'Not listed' : l.followers,
    }));

    // Final safety filter — remove any lead that is a known platform
    const badNames = ['fiverr','upwork','veed','canva','freelancer','toptal','99designs','guru'];
    leads = leads.filter(l => !badNames.some(b => (l.name || '').toLowerCase().includes(b)));

    return res.status(200).json({ leads, source: 'live', count: leads.length });

  } catch (err) {
    console.error('Opportunity Engine fatal error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [], source: 'error' });
  }
}
