// api/opportunity.js
// Opportunity Engine — SerpApi (real data) + Groq (AI scoring)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, prompt, signals = [], budget = [], platform = 'all' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const SERP  = process.env.SERPA// api/opportunity.js
// Opportunity Engine — SerpApi (real data) + Groq (AI scoring)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, prompt, signals = [], budget = [], platform = 'all' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const SERP = process.env.SERPAPI_KEY;
  const GROQ = process.env.GROQ_API_KEY;

  let rawProfiles = [];

  try {

    if (type === 'Content Creators') {
      const platformTarget = platform === 'youtube' ? 'site:youtube.com/@'
        : platform === 'linkedin' ? 'site:linkedin.com/in'
        : platform === 'tiktok' ? 'site:tiktok.com/@'
        : 'site:instagram.com';
      const query = `${prompt} -agency -brand -marketing -hire -collaboration ${platformTarget}`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || [])
        .filter(r => {
          const link = r.link || '';
          return (
            link.includes('instagram.com/') ||
            link.includes('youtube.com/@') ||
            link.includes('tiktok.com/@') ||
            link.includes('linkedin.com/in/')
          ) && !link.includes('/p/') && !link.includes('/reel/');
        })
        .map(r => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          displayed_link: r.displayed_link,
        }));

    } else if (type === 'Local Businesses') {
      const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(prompt)}&type=search&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.local_results || []).slice(0, 10).map(r => ({
        title: r.title,
        rating: r.rating,
        reviews: r.reviews,
        type: r.type,
        address: r.address,
        phone: r.phone,
        website: r.website,
        hours: r.hours,
        thumbnail: r.thumbnail,
      }));

    } else if (type === 'Startups') {
      const query = `${prompt} site:producthunt.com/products`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || [])
        .filter(r => (r.link || '').includes('producthunt.com'))
        .map(r => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          displayed_link: r.displayed_link,
        }));

    } else if (type === 'E-commerce Brands') {
      // Search for actual Shopify stores directly
      const query = `${prompt} store -blog -list -"top 10" -"best shopify" -theme -template`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || [])
        .filter(r => {
          const link = r.link || '';
          // filter out blogs, listicles, theme sites
          return !link.includes('oberlo') &&
                 !link.includes('shopify.com/blog') &&
                 !link.includes('omegatheme') &&
                 !link.includes('articles') &&
                 !link.includes('blog');
        })
        .map(r => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          displayed_link: r.displayed_link,
        }));

    } else if (type === 'Coaches & Consultants') {
      const query = `${prompt} site:linkedin.com/in -recruiter -hiring`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || [])
        .filter(r => (r.link || '').includes('linkedin.com/in/'))
        .map(r => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          displayed_link: r.displayed_link,
        }));
    }

    // ─────────────────────────────────────────────
    // GROQ: Analyse real profiles + return leads
    // ─────────────────────────────────────────────

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        messages: [{
          role: 'user',
          content: `You are an expert freelance opportunity analyser for a tool called Lancify.

Target type: ${type}
Platform focus: ${platform === 'all' ? 'any platform' : platform}
User is looking for: ${prompt}
Pain signals to check: ${signals.join(', ') || 'any problem signals'}
Budget signals to check: ${budget.join(', ') || 'any budget signals'}

Here are ${rawProfiles.length} REAL profiles found from live search:
${rawProfiles.length > 0
  ? JSON.stringify(rawProfiles.slice(0, 8), null, 2)
  : 'No live profiles found. Generate 3 realistic leads based on your knowledge of this niche.'}

STRICT RULES:
- ONLY pick individual people, creators, or actual businesses — NOT agencies, blogs, or marketing companies
- IGNORE any result that sells services TO creators or businesses
- IGNORE blog posts, listicles, "top 10" articles, theme sites
- Pick results where the person/business clearly has a problem matching the pain signals
- Use the REAL name and REAL link from the data — do not invent URLs
- For followers: extract from snippet if visible, else write "Not listed" — never write "no data"
- redFlag must be a specific warning string OR the exact value null — never write the word "null" as a string

Return top 3 as a JSON array with EXACTLY these keys:
{
  "name": "real name from search results",
  "platform": "platform e.g. Instagram, YouTube, LinkedIn, Shopify, Google Maps",
  "followers": "audience size from snippet or 'Not listed'",
  "problem": "specific problem detected from their snippet — be concrete",
  "strategy": "exact outreach strategy for this specific lead",
  "match": <integer 80-99>,
  "reason": "one sentence why this score",
  "whyNow": "one sentence timing urgency",
  "redFlag": null,
  "closingHint": "one sentence closing strategy",
  "replyChance": <integer 35-90>,
  "jobDesc": "job description as if posted on Upwork",
  "profileUrl": "the exact URL from the search result — never make this up"
}

Return ONLY the raw JSON array. No explanation. No markdown. No code fences.`
        }],
      }),
    });

    const groqData = await groqRes.json();
    const rawText = groqData?.choices?.[0]?.message?.content || '[]';
    let leads = [];
    try {
      leads = JSON.parse(rawText);
    } catch {
      leads = [];
    }

    // Clean up null strings
    leads = leads.map(l => ({
      ...l,
      redFlag: (l.redFlag === 'null' || l.redFlag === 'None' || l.redFlag === 'none' || l.redFlag === '') ? null : l.redFlag,
      followers: (l.followers === 'no data' || l.followers === 'N/A' || !l.followers) ? 'Not listed' : l.followers,
    }));

    return res.status(200).json({ leads, source: 'live' });

  } catch (err) {
    console.error('Opportunity Engine API error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [] });
  }
}PI_KEY;
  const GROQ  = process.env.GROQ_API_KEY;

  let rawProfiles = [];

  try {

    // ─────────────────────────────────────────────
    // REAL DATA: SerpApi scraping per target type
    // ─────────────────────────────────────────────

    if (type === 'Content Creators') {
  const platformTarget = platform === 'youtube' ? 'site:youtube.com/@'
    : platform === 'linkedin' ? 'site:linkedin.com/in'
    : platform === 'tiktok' ? 'site:tiktok.com/@'
    : 'site:instagram.com';

  const query = `${prompt} -agency -brand -marketing -hire -collaboration ${platformTarget}`;
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
  const serpRes = await fetch(url);
  const serpData = await serpRes.json();
  rawProfiles = (serpData.organic_results || []).map(r => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    displayed_link: r.displayed_link,
  }));

    } else if (type === 'Local Businesses') {
      // Google Maps local search
      const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(prompt)}&type=search&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.local_results || []).slice(0, 10).map(r => ({
        title: r.title,
        rating: r.rating,
        reviews: r.reviews,
        type: r.type,
        address: r.address,
        phone: r.phone,
        website: r.website,
        hours: r.hours,
      }));

    } else if (type === 'Startups') {
      // Product Hunt startups via Google
      const query = `${prompt} site:producthunt.com`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || []).map(r => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        displayed_link: r.displayed_link,
      }));

    } else if (type === 'E-commerce Brands') {
      // Shopify stores via Google
      const query = `${prompt} site:myshopify.com OR shopify store`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || []).map(r => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        displayed_link: r.displayed_link,
      }));

    } else if (type === 'Coaches & Consultants') {
      // LinkedIn coaches via Google
      const query = `${prompt} site:linkedin.com/in`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || []).map(r => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        displayed_link: r.displayed_link,
      }));
    }

    // ─────────────────────────────────────────────
    // GROQ: Analyse real profiles + return leads
    // ─────────────────────────────────────────────

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        messages: [{
          role: 'user',
          content: `You are an expert freelance opportunity analyser for a tool called Lancify.

Target type: ${type}
Platform focus: ${platform === 'all' ? 'any platform' : platform}
User is looking for: ${prompt}
Pain signals to check: ${signals.join(', ') || 'any problem signals'}
Budget signals to check: ${budget.join(', ') || 'any budget signals'}

Here are ${rawProfiles.length} REAL profiles/businesses found from live search:
${rawProfiles.length > 0
  ? JSON.stringify(rawProfiles.slice(0, 8), null, 2)
  : 'No live profiles found. Generate 3 realistic leads based on your knowledge of this niche.'}

Your job:
- ONLY pick profiles that are INDIVIDUAL creators/people who need freelance help
- IGNORE agencies, brands, marketing companies, or platforms
- IGNORE any result that is selling services TO creators
- Pick results where the person clearly has a problem: no funnel, inconsistent posting, poor design, no CTA
- Use the REAL name, REAL link from the data above
- The profileUrl must be their actual Instagram/YouTube/LinkedIn profile URL
  "name": "real account or business name from search results",
  "platform": "platform they are on e.g. Instagram, YouTube, LinkedIn, Google Maps",
  "followers": "audience size if visible in snippet, else estimate from context e.g. '12k followers'",
  "problem": "the SPECIFIC problem you detected from their snippet/description — be concrete",
  "strategy": "exact outreach strategy for this specific lead",
  "match": <integer 80-99 based on signal match quality>,
  "reason": "one sentence explaining why this score",
  "whyNow": "one sentence timing urgency — why reach out THIS WEEK",
  "redFlag": "one sentence warning if concern exists, or null if clean",
  "closingHint": "one sentence closing strategy for this specific lead",
  "replyChance": <integer 35-90 estimated reply probability>,
  "jobDesc": "job description as if they posted on Upwork seeking this freelancer's service",
  "profileUrl": "the REAL URL from the search result data above — do not make this up"
}

Return ONLY the raw JSON array. No explanation. No markdown. No code fences.`
        }],
      }),
    });

    const groqData = await groqRes.json();
    const rawText = groqData?.choices?.[0]?.message?.content || '[]';
    let leads = [];
    try {
      leads = JSON.parse(rawText);
    } catch {
      leads = [];
    }

    return res.status(200).json({ leads, source: 'live' });

  } catch (err) {
    console.error('Opportunity Engine API error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [] });
  }
}
