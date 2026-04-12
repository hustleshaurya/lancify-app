// api/opportunity.js
// Opportunity Engine backend — Apify + Phantom Buster + Claude scoring

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

 const { type, prompt, signals = [], budget = [], platform = 'all' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const APIFY   = process.env.APIFY_API_TOKEN;
  const PHANTOM = process.env.PHANTOM_BUSTER_KEY;
  const CLAUDE  = process.env.ANTHROPIC_API_KEY;

  let rawProfiles = [];

  try {

    if (type === 'Content Creators') {
      const hashtag = prompt.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
      const pbRes = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Phantombuster-Key': PHANTOM,
        },
        body: JSON.stringify({
          id: '6863000950412420',
          argument: {
            hashtag,
            numberOfProfilesPerLaunch: 15,
          }
        }),
      });
      const pbData = await pbRes.json();
      await new Promise(r => setTimeout(r, 8000));
      const resultRes = await fetch(`https://api.phantombuster.com/api/v2/agents/fetch-output?id=${pbData.containerId}`, {
        headers: { 'X-Phantombuster-Key': PHANTOM }
      });
      const resultData = await resultRes.json();
      rawProfiles = JSON.parse(resultData.output || '[]').slice(0, 10);

    } else if (type === 'Local Businesses') {
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/apify~google-maps-scraper/runs?token=${APIFY}&waitForFinish=90`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchStringsArray: [prompt],
            maxCrawledPlaces: 15,
            language: 'en',
          }),
        }
      );
      const runData = await runRes.json();
      const dsRes = await fetch(
        `https://api.apify.com/v2/datasets/${runData?.data?.defaultDatasetId}/items?token=${APIFY}&limit=15`
      );
      rawProfiles = await dsRes.json();

    } else if (type === 'Startups' || type === 'E-commerce Brands') {
      const searchQuery = type === 'Startups'
        ? `site:producthunt.com ${prompt}`
        : `site:myshopify.com ${prompt}`;
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/apify~web-scraper/runs?token=${APIFY}&waitForFinish=60`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}` }],
            maxPagesPerCrawl: 3,
          }),
        }
      );
      const runData = await runRes.json();
      const dsRes = await fetch(
        `https://api.apify.com/v2/datasets/${runData?.data?.defaultDatasetId}/items?token=${APIFY}&limit=10`
      );
      rawProfiles = await dsRes.json();

    } else if (type === 'Coaches & Consultants') {
      const pbRes = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Phantombuster-Key': PHANTOM,
        },
        body: JSON.stringify({
          id: '8772757024242119',
          argument: {
            searchQuery: prompt,
            numberOfResultsPerSearch: 15,
          }
        }),
      });
      const pbData = await pbRes.json();
      await new Promise(r => setTimeout(r, 10000));
      const resultRes = await fetch(`https://api.phantombuster.com/api/v2/agents/fetch-output?id=${pbData.containerId}`, {
        headers: { 'X-Phantombuster-Key': PHANTOM }
      });
      const resultData = await resultRes.json();
      rawProfiles = JSON.parse(resultData.output || '[]').slice(0, 10);
    }

   const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
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

Here are ${rawProfiles.length} raw scraped profiles:
${rawProfiles.length > 0
  ? JSON.stringify(rawProfiles.slice(0, 8), null, 2)
  : 'No live profiles were scraped. Use your own knowledge to generate 3 realistic, specific, and believable leads for this target type and prompt. Make the names, platforms, problems and strategies feel real and actionable.'}

Analyse each profile and return the top 3 best freelance opportunities as a JSON array.
Each object must have EXACTLY these keys:
{
  "name": "account or business name",
  "platform": "platform they are on",
  "followers": "their audience size as a human string e.g. '8.4k followers'",
  "problem": "the SPECIFIC problem you detected — be concrete, cite real evidence from the profile data",
  "strategy": "the exact outreach strategy for this lead",
  "match": <integer 80-99 based on signal match quality>,
  "reason": "one sentence explaining why this score",
  "whyNow": "one sentence timing urgency — why the user should reach out THIS WEEK specifically",
  "redFlag": "one sentence warning if there is a concern, or null if clean lead",
  "closingHint": "one sentence closing strategy advice for this specific lead",
  "replyChance": <integer 35-90 estimated reply probability>,
 "jobDesc": "a job description as if they posted it on Upwork seeking exactly the freelancer's service",
  "profileUrl": "construct a real working profile URL based on their name and platform — e.g. https://instagram.com/username or https://youtube.com/@handle or https://linkedin.com/in/name or https://tiktok.com/@username"
}

Return ONLY the raw JSON array. No explanation. No markdown. No code fences.`
    }],
  }),
});

const groqData = await groqRes.json();
const rawText = groqData?.choices?.[0]?.message?.content || '[]';
    let leads = [];
    try { leads = JSON.parse(rawText); } catch { leads = []; }

    return res.status(200).json({ leads, source: 'live' });

  } catch (err) {
    console.error('Opportunity Engine API error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [] });
  }
}
