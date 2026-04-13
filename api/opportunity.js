// api/opportunity.js
// Opportunity Engine — Custom Apify Actors + SerpApi Fallback + Groq

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    type      = 'Local Businesses',
    prompt    = '',
    platform  = 'all',
    skill     = null,
    incomeGoal = null,
  } = req.body;

  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  // 🔑 YOUR API KEYS
  const SERP  = process.env.SERPAPI_KEY;
  const GROQ  = process.env.GROQ_API_KEY;
  const APIFY = process.env.APIFY_API_TOKEN;

  let rawProfiles = [];
  let apiWarning  = null;

  // ─────────────────────────────────────────────────────────
  // HELPER 1: APIFY ACTOR ROUTER
  // Calls your specific Apify Actors using run-sync-get-dataset
  // ─────────────────────────────────────────────────────────
  async function runApifyActor(actorId, inputConfig) {
    if (!APIFY) {
      console.warn("Apify token missing");
      return [];
    }
    
    // We use run-sync-get-dataset so Vercel waits for the scrape to finish
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset?token=${APIFY}`;
    
    try {
      const response = await fetch(apifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputConfig)
      });

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error(`Apify Actor [${actorId}] Error:`, err);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // HELPER 2: SERPAPI FALLBACK (For YouTube / Generic Web)
  // ─────────────────────────────────────────────────────────
  async function searchSerpApi(q) {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=10&api_key=${SERP}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      return (data.organic_results || []).slice(0, 8).map(r => ({
        name: r.title,
        description: r.snippet,
        profileUrl: r.link,
        platform: r.link.includes('youtube.com') ? 'YouTube' : 'Website',
      }));
    } catch (e) { return []; }
  }

  try {
    // ─────────────────────────────────────────────────────────
    // STEP 1 — ROUTE THE PROMPT TO THE CORRECT SCRAPER
    // ─────────────────────────────────────────────────────────
    console.log(`[OppEngine] Starting scan for: ${prompt} on ${platform}`);

    // 1. LOCAL BUSINESSES -> Google Maps Scraper (compass/crawler-google-places)
    if (type === 'Local Businesses' || platform === 'Google Maps') {
      const mapsData = await runApifyActor('compass/crawler-google-places', {
        searchStringsArray: [prompt],
        maxCrawledPlacesPerSearch: 8 // Keep it low so it finishes under 60 seconds
      });
      
      rawProfiles = mapsData.map(item => ({
        name: item.title,
        description: `Category: ${item.categoryName}. Reviews: ${item.reviewsCount}. Rating: ${item.totalScore}. Address: ${item.address}`,
        profileUrl: item.website || item.url || "No website listed",
        platform: 'Google Maps'
      }));

      // Fallback if Maps fails
      if (rawProfiles.length === 0) rawProfiles = await searchSerpApi(prompt + " local business");
    }

    // 2. INSTAGRAM -> Instagram Hashtag Scraper (apify/instagram-hashtag-scraper)
    else if (platform === 'Instagram' || platform === 'instagram') {
      // Convert prompt to a single hashtag (e.g., "fitness coach" -> "fitnesscoach")
      const hashtag = prompt.replace(/[^a-zA-Z0-9]/g, '');
      const igData = await runApifyActor('apify/instagram-hashtag-scraper', {
        hashtags: [hashtag],
        resultsLimit: 8
      });

      rawProfiles = igData.map(item => ({
        name: item.ownerFullName || item.ownerUsername || 'Instagram User',
        description: item.caption,
        followers: 'Check profile', // Hashtag scraper usually pulls post data, not deep profile data
        profileUrl: item.url,
        platform: 'Instagram'
      }));
    }

    // 3. LINKEDIN -> Mass LinkedIn Scraper (dev_fusion)
    else if (platform === 'LinkedIn' || platform === 'linkedin') {
      // NOTE: Replace 'dev_fusion/mass-linkedin-scraper' with the EXACT ID from your Apify dashboard
      const liData = await runApifyActor('dev_fusion/Linkedin-Profile-Scraper', {
        queries: [prompt],
        maxResults: 8
      });

      rawProfiles = liData.map(item => ({
        name: item.fullName || item.name || 'LinkedIn User',
        description: item.headline || item.about,
        profileUrl: item.url || item.linkedInUrl,
        platform: 'LinkedIn'
      }));
    }

    // 4. EVERYTHING ELSE (YouTube, Startups, Web) -> SerpApi
    else {
      rawProfiles = await searchSerpApi(prompt);
    }

    console.log(`[OppEngine] Found ${rawProfiles.length} raw profiles.`);

    if (rawProfiles.length === 0) {
      return res.status(200).json({
        leads: [], source: 'live', empty: true,
        warning: 'Scrapers timed out or found no results. Try a broader search.',
      });
    }

    // ─────────────────────────────────────────────────────────
    // STEP 2 — GROQ (Llama-3) INTELLIGENCE ANALYSIS
    // ─────────────────────────────────────────────────────────
    const incomeContext = incomeGoal ? `The freelancer wants to earn around $${incomeGoal}/month. Estimate deal values accordingly.` : '';
    const skillContext = skill ? `The freelancer's skill is: ${skill}. Only pick leads who SPECIFICALLY need this skill.` : '';

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        messages: [{
          role: 'user',
          content: `You are a freelance client-finder for a tool called Lancify. 
${skillContext}
${incomeContext}
Search context: ${prompt}

Here are REAL leads scraped from Apify and SerpApi:
${JSON.stringify(rawProfiles.slice(0, 8), null, 2)}

RULES:
- Pick only REAL businesses or creators from the data.
- Each lead must have a clear problem that the freelancer's skill directly solves.
- Use REAL name and REAL URL from the data.
- Followers: Estimate based on data or use "Not listed".
- redFlag: a specific warning OR JSON null.
- dealValue: realistic price for a beginner freelancer (e.g. '$200 – $500').

Return top 3 as a JSON array exactly matching this structure:
[{
  "name": "real name",
  "platform": "YouTube / Instagram / LinkedIn / Google Maps / Website",
  "followers": "audience size or 'Not listed'",
  "problem": "their specific problem in plain English — 1 sentence",
  "strategy": "how to reach out to them — simple and direct",
  "match": 92,
  "reason": "why this is a good lead for someone with this skill",
  "whyNow": "why reach out THIS WEEK",
  "redFlag": null,
  "closingHint": "simple closing tip for a beginner",
  "replyChance": 85,
  "jobDesc": "what job they would post on Upwork",
  "profileUrl": "exact URL from data",
  "dealValue": "$300 - $600"
}]

Return ONLY the raw JSON array. No explanation. No markdown.`
        }],
      }),
    });

    const groqData = await groqRes.json();
    const rawText  = groqData?.choices?.[0]?.message?.content || '[]';

    let leads = [];
    try { leads = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim()); } 
    catch { leads = []; }

    return res.status(200).json({ leads, source: 'apify+serp', count: leads.length });

  } catch (err) {
    console.error('Opportunity Engine fatal error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [] });
  }
}
