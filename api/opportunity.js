// api/opportunity.js
// Opportunity Engine — YouTube API + SerpApi + Groq

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, prompt, signals = [], budget = [], platform = 'all' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const SERP    = process.env.SERPAPI_KEY;
  const GROQ    = process.env.GROQ_API_KEY;
  const YOUTUBE = process.env.YOUTUBE_API_KEY;

 rawProfiles = (detailData.items || [])
  .filter(ch => {
    const title = ch.snippet?.title || '';
    // Remove auto-generated music Topic channels
    return !title.includes('- Topic') &&
           !title.includes('- topic') &&
           parseInt(ch.statistics?.subscriberCount || 0) > 500;
  })
  .map(ch => {

  try {

    if (type === 'Content Creators') {

      if (platform === 'youtube' || platform === 'all') {
        // ── YouTube Data API v3 ──
       // Add "channel" keyword + exclude Topic channels
const ytQuery = `${prompt} channel -topic -music -rapper -singer`;
const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(ytQuery)}&type=channel&maxResults=15&regionCode=US&relevanceLanguage=en&key=${YOUTUBE}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (searchData.items && searchData.items.length > 0) {
          const channelIds = searchData.items
            .map(i => i.id.channelId)
            .filter(Boolean)
            .join(',');

          const detailUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds}&key=${YOUTUBE}`;
          const detailRes = await fetch(detailUrl);
          const detailData = await detailRes.json();

          const youtubeProfiles = (detailData.items || []).map(ch => {
            const subs = parseInt(ch.statistics?.subscriberCount || 0);
            const subsFormatted = subs >= 1000000
              ? `${(subs/1000000).toFixed(1)}M subscribers`
              : subs >= 1000
              ? `${(subs/1000).toFixed(1)}k subscribers`
              : `${subs} subscribers`;

            return {
              name: ch.snippet?.title,
              description: ch.snippet?.description?.slice(0, 200),
              subscribers: subsFormatted,
              subscriberCount: subs,
              videoCount: ch.statistics?.videoCount,
              viewCount: ch.statistics?.viewCount,
              country: ch.snippet?.country,
              profileUrl: ch.snippet?.customUrl
                ? `https://youtube.com/${ch.snippet.customUrl}`
                : `https://youtube.com/channel/${ch.id}`,
              platform: 'YouTube',
            };
          });

          rawProfiles = [...rawProfiles, ...youtubeProfiles];
        }
      }

      if (platform === 'instagram' || platform === 'all') {
        // ── SerpApi Instagram Search ──
        const igQuery = `${prompt} -agency -brand -marketing site:instagram.com`;
        const igUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(igQuery)}&num=5&api_key=${SERP}`;
        const igRes = await fetch(igUrl);
        const igData = await igRes.json();

        const igProfiles = (igData.organic_results || [])
          .filter(r => {
            const link = r.link || '';
            return link.includes('instagram.com/') &&
              !link.includes('/p/') &&
              !link.includes('/reel/') &&
              !link.includes('/explore/');
          })
          .map(r => ({
            name: r.title?.replace(' • Instagram', '').replace(' (@', ' (').split('(')[0].trim(),
            description: r.snippet,
            profileUrl: r.link,
            platform: 'Instagram',
            snippet: r.snippet,
          }));

        rawProfiles = [...rawProfiles, ...igProfiles];
      }

      if (platform === 'tiktok') {
        // ── SerpApi TikTok Search ──
        const ttQuery = `${prompt} -agency -brand site:tiktok.com/@`;
        const ttUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(ttQuery)}&num=5&api_key=${SERP}`;
        const ttRes = await fetch(ttUrl);
        const ttData = await ttRes.json();

        const ttProfiles = (ttData.organic_results || [])
          .filter(r => (r.link || '').includes('tiktok.com/@'))
          .map(r => ({
            name: r.title?.replace(' | TikTok', '').trim(),
            description: r.snippet,
            profileUrl: r.link,
            platform: 'TikTok',
            snippet: r.snippet,
          }));

        rawProfiles = [...rawProfiles, ...ttProfiles];
      }

      if (platform === 'linkedin') {
        // ── SerpApi LinkedIn Search ──
        const liQuery = `${prompt} content creator site:linkedin.com/in`;
        const liUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(liQuery)}&num=5&api_key=${SERP}`;
        const liRes = await fetch(liUrl);
        const liData = await liRes.json();

        const liProfiles = (liData.organic_results || [])
          .filter(r => (r.link || '').includes('linkedin.com/in/'))
          .map(r => ({
            name: r.title?.replace(' | LinkedIn', '').trim(),
            description: r.snippet,
            profileUrl: r.link,
            platform: 'LinkedIn',
            snippet: r.snippet,
          }));

        rawProfiles = [...rawProfiles, ...liProfiles];
      }

    } else if (type === 'Local Businesses') {
      // ── SerpApi Google Maps ──
      const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(prompt)}&type=search&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.local_results || []).slice(0, 10).map(r => ({
        name: r.title,
        rating: r.rating,
        reviews: r.reviews,
        type: r.type,
        address: r.address,
        phone: r.phone,
        website: r.website,
        hours: r.hours,
        platform: 'Google Maps',
      }));

      // Broader fallback if maps returns nothing
      if (rawProfiles.length === 0) {
        const fallbackUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' business')}&num=10&api_key=${SERP}`;
        const fallbackRes = await fetch(fallbackUrl);
        const fallbackData = await fallbackRes.json();
        rawProfiles = (fallbackData.organic_results || []).slice(0, 8).map(r => ({
          name: r.title,
          link: r.link,
          snippet: r.snippet,
          platform: 'Website',
        }));
      }

    } else if (type === 'Startups') {
      // ── SerpApi Product Hunt ──
      const query = `${prompt} site:producthunt.com/products`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || [])
        .filter(r => (r.link || '').includes('producthunt.com'))
        .map(r => ({
          name: r.title,
          link: r.link,
          snippet: r.snippet,
          platform: 'Product Hunt',
        }));

      // Fallback
      if (rawProfiles.length === 0) {
        const fallbackUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' startup saas')}&num=10&api_key=${SERP}`;
        const fallbackRes = await fetch(fallbackUrl);
        const fallbackData = await fallbackRes.json();
        rawProfiles = (fallbackData.organic_results || []).slice(0, 8).map(r => ({
          name: r.title,
          link: r.link,
          snippet: r.snippet,
          platform: 'Website',
        }));
      }

    } else if (type === 'E-commerce Brands') {
      // ── SerpApi Shopify Stores ──
      const query = `${prompt} store -blog -list -"top 10" -"best shopify" -theme -template`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || [])
        .filter(r => {
          const link = r.link || '';
          return !link.includes('oberlo') &&
            !link.includes('shopify.com/blog') &&
            !link.includes('omegatheme') &&
            !link.includes('blog') &&
            !link.includes('articles');
        })
        .map(r => ({
          name: r.title,
          link: r.link,
          snippet: r.snippet,
          platform: 'Shopify',
        }));

      // Fallback
      if (rawProfiles.length === 0) {
        const fallbackUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' online store ecommerce')}&num=10&api_key=${SERP}`;
        const fallbackRes = await fetch(fallbackUrl);
        const fallbackData = await fallbackRes.json();
        rawProfiles = (fallbackData.organic_results || []).slice(0, 8).map(r => ({
          name: r.title,
          link: r.link,
          snippet: r.snippet,
          platform: 'E-commerce',
        }));
      }

    } else if (type === 'Coaches & Consultants') {
      // ── SerpApi LinkedIn ──
      const query = `${prompt} site:linkedin.com/in -recruiter -hiring`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERP}`;
      const serpRes = await fetch(url);
      const serpData = await serpRes.json();
      rawProfiles = (serpData.organic_results || [])
        .filter(r => (r.link || '').includes('linkedin.com/in/'))
        .map(r => ({
          name: r.title?.replace(' | LinkedIn', '').trim(),
          link: r.link,
          snippet: r.snippet,
          platform: 'LinkedIn',
        }));

      // Fallback
      if (rawProfiles.length === 0) {
        const fallbackUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' coach consultant')}&num=10&api_key=${SERP}`;
        const fallbackRes = await fetch(fallbackUrl);
        const fallbackData = await fallbackRes.json();
        rawProfiles = (fallbackData.organic_results || []).slice(0, 8).map(r => ({
          name: r.title,
          link: r.link,
          snippet: r.snippet,
          platform: 'Website',
        }));
      }
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
- ONLY pick individual creators or actual businesses — NOT agencies, blogs, or marketing companies
- IGNORE any result that sells services TO creators or businesses
- IGNORE blog posts, listicles, theme sites, top-10 articles
- Pick results where the person/business has a clear problem matching the pain signals
- Use the REAL name and REAL profileUrl from the data — do not invent URLs
- For YouTube: use subscriberCount to determine audience size
- For followers: use real data from the profile, never write "no data" — write "Not listed" if unknown
- redFlag must be a real concern string OR exactly null — never write the word "null" as text

Return top 3 as a JSON array with EXACTLY these keys:
{
  "name": "real name from search results",
  "platform": "platform e.g. YouTube, Instagram, LinkedIn, Google Maps, Shopify",
  "followers": "real audience size e.g. '8.4k subscribers' or 'Not listed'",
  "problem": "specific problem detected — be concrete, reference actual data from their profile",
  "strategy": "exact outreach strategy for this specific lead",
  "match": <integer 80-99>,
  "reason": "one sentence why this score",
  "whyNow": "one sentence timing urgency — why reach out THIS WEEK",
  "redFlag": null,
  "closingHint": "one sentence closing strategy",
  "replyChance": <integer 35-90>,
  "jobDesc": "job description as if posted on Upwork",
  "profileUrl": "exact URL from the search result data — never make this up"
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

    // Clean up bad values
    leads = leads.map(l => ({
      ...l,
      redFlag: (l.redFlag === 'null' || l.redFlag === 'None' ||
                l.redFlag === 'none' || l.redFlag === '' ||
                l.redFlag === 'N/A') ? null : l.redFlag,
      followers: (!l.followers || l.followers === 'no data' ||
                  l.followers === 'N/A' || l.followers === 'undefined')
                  ? 'Not listed' : l.followers,
    }));

    return res.status(200).json({ leads, source: 'live' });

  } catch (err) {
    console.error('Opportunity Engine API error:', err);
    return res.status(500).json({ error: err.message || 'Scan failed', leads: [] });
  }
}
