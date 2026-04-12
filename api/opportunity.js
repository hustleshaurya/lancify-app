// api/opportunity.js
// Opportunity Engine — SerpApi (real data) + Groq (AI scoring)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, prompt, signals = [], budget = [], platform = 'all' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const SERP  = process.env.SERPAPI_KEY;
  const GROQ  = process.env.GROQ_API_KEY;

  let rawProfiles = [];

  try {

    // ─────────────────────────────────────────────
    // REAL DATA: SerpApi scraping per target type
    // ─────────────────────────────────────────────

    if (type === 'Content Creators') {
      // Search Instagram/YouTube creators via Google
      const query = `${prompt} instagram OR youtube creator site:instagram.com OR site:youtube.com`;
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
- Analyse each real profile from the data above
- Identify their specific freelance opportunity gap
- Score and rank the top 3 as actionable leads
- Use the REAL name, REAL link, REAL platform from the data
- Extract follower/audience size from the snippet if visible
- The "profileUrl" must be the REAL link from the search result, not made up

Return the top 3 as a JSON array. Each object must have EXACTLY these keys:
{
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
