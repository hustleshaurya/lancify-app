// api/opportunity.js
// Opportunity Engine — YouTube API + SerpApi + Groq

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, prompt, signals = [], budget = [], platform = 'all' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const SERP    = process.env.SERPAPI_KEY;
  const GROQ    = process.env.GROQ_API_KEY;
  const YOUTUBE = process.env.YOUTUBE_API_KEY;

  let rawProfiles = [];
  let apiWarning  = null;

  try {

    // ─────────────────────────────────────────────────────────
    // STEP 1 — SCRAPE REAL DATA based on target type
    // ─────────────────────────────────────────────────────────

    if (type === 'Content Creators') {

      // ── YouTube ──
      if (platform === 'youtube' || platform === 'all') {
        try {
          const ytQuery    = `${prompt} channel -topic -music -rapper -singer -vevo`;
          const searchUrl  = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(ytQuery)}&type=channel&maxResults=15&regionCode=US&relevanceLanguage=en&key=${YOUTUBE}`;
          const searchRes  = await fetch(searchUrl);
          const searchData = await searchRes.json();

          if (searchData.error) {
            apiWarning = `YouTube API error: ${searchData.error.message}`;
          } else if (searchData.items && searchData.items.length > 0) {
            const channelIds = searchData.items
              .map(i => i.id?.channelId)
              .filter(Boolean)
              .join(',');

            if (channelIds) {
              const detailUrl  = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds}&key=${YOUTUBE}`;
              const detailRes  = await fetch(detailUrl);
              const detailData = await detailRes.json();

              const ytProfiles = (detailData.items || [])
                .filter(ch => {
                  const title = ch.snippet?.title || '';
                  const subs  = parseInt(ch.statistics?.subscriberCount || 0);
                  return !title.includes('- Topic') &&
                         !title.includes('- topic') &&
                         !title.toLowerCase().includes('vevo') &&
                         subs > 100;
                })
                .map(ch => {
                  const subs = parseInt(ch.statistics?.subscriberCount || 0);
                  const subsFormatted = subs >= 1000000
                    ? `${(subs / 1000000).toFixed(1)}M subscribers`
                    : subs >= 1000
                    ? `${(subs / 1000).toFixed(1)}k subscribers`
                    : `${subs} subscribers`;

                  return {
                    name:            ch.snippet?.title,
                    description:     ch.snippet?.description?.slice(0, 300),
                    subscribers:     subsFormatted,
                    subscriberCount: subs,
                    videoCount:      ch.statistics?.videoCount,
                    viewCount:       ch.statistics?.viewCount,
                    country:         ch.snippet?.country,
                    profileUrl:      ch.snippet?.customUrl
                      ? `https://youtube.com/${ch.snippet.customUrl}`
                      : `https://youtube.com/channel/${ch.id}`,
                    platform:        'YouTube',
                  };
                });

              rawProfiles = [...rawProfiles, ...ytProfiles];
            }
          }
        } catch (ytErr) {
          apiWarning = `YouTube fetch failed: ${ytErr.message}`;
          console.error('YouTube error:', ytErr);
        }
      }

      // ── Instagram via SerpApi ──
      if (platform === 'instagram' || platform === 'all') {
        try {
          const igQuery = `${prompt} -agency -brand -marketing -hire site:instagram.com`;
          const igUrl   = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(igQuery)}&num=8&api_key=${SERP}`;
          const igRes   = await fetch(igUrl);
          const igData  = await igRes.json();

          const igProfiles = (igData.organic_results || [])
            .filter(r => {
              const link = r.link || '';
              return link.includes('instagram.com/') &&
                !link.includes('/p/') &&
                !link.includes('/reel/') &&
                !link.includes('/explore/') &&
                !link.includes('/stories/');
            })
            .map(r => ({
              name:       r.title?.replace(' • Instagram photos and videos', '').replace(' • Instagram', '').split('(')[0].trim(),
              description: r.snippet,
              profileUrl:  r.link,
              platform:   'Instagram',
            }));

          rawProfiles = [...rawProfiles, ...igProfiles];
        } catch (igErr) {
          console.error('Instagram SerpApi error:', igErr);
        }
      }

      // ── TikTok via SerpApi ──
      if (platform === 'tiktok') {
        try {
          const ttQuery = `${prompt} -agency -brand site:tiktok.com/@`;
          const ttUrl   = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(ttQuery)}&num=8&api_key=${SERP}`;
          const ttRes   = await fetch(ttUrl);
          const ttData  = await ttRes.json();

          const ttProfiles = (ttData.organic_results || [])
            .filter(r => (r.link || '').includes('tiktok.com/@'))
            .map(r => ({
              name:        r.title?.replace(' | TikTok', '').trim(),
              description: r.snippet,
              profileUrl:  r.link,
              platform:    'TikTok',
            }));

          rawProfiles = [...rawProfiles, ...ttProfiles];
        } catch (ttErr) {
          console.error('TikTok SerpApi error:', ttErr);
        }
      }

      // ── LinkedIn creators via SerpApi ──
      if (platform === 'linkedin') {
        try {
          const liQuery = `${prompt} creator site:linkedin.com/in`;
          const liUrl   = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(liQuery)}&num=8&api_key=${SERP}`;
          const liRes   = await fetch(liUrl);
          const liData  = await liRes.json();

          const liProfiles = (liData.organic_results || [])
            .filter(r => (r.link || '').includes('linkedin.com/in/'))
            .map(r => ({
              name:        r.title?.replace(' | LinkedIn', '').trim(),
              description: r.snippet,
              profileUrl:  r.link,
              platform:    'LinkedIn',
            }));

          rawProfiles = [...rawProfiles, ...liProfiles];
        } catch (liErr) {
          console.error('LinkedIn SerpApi error:', liErr);
        }
      }

    } else if (type === 'Local Businesses') {

      try {
        const mapsUrl = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(prompt)}&type=search&api_key=${SERP}`;
        const mapsRes = await fetch(mapsUrl);
        const mapsData = await mapsRes.json();

        rawProfiles = (mapsData.local_results || []).slice(0, 10).map(r => ({
          name:     r.title,
          rating:   r.rating,
          reviews:  r.reviews,
          type:     r.type,
          address:  r.address,
          phone:    r.phone,
          website:  r.website,
          hours:    r.hours,
          platform: 'Google Maps',
        }));
      } catch (mapsErr) {
        console.error('Maps error:', mapsErr);
      }

      // Fallback to Google search
      if (rawProfiles.length === 0) {
        try {
          const fbUrl  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' local business')}&num=10&api_key=${SERP}`;
          const fbRes  = await fetch(fbUrl);
          const fbData = await fbRes.json();
          rawProfiles  = (fbData.organic_results || []).slice(0, 8).map(r => ({
            name:     r.title,
            link:     r.link,
            snippet:  r.snippet,
            platform: 'Website',
          }));
        } catch (fbErr) {
          console.error('Fallback error:', fbErr);
        }
      }

    } else if (type === 'Startups') {

      try {
        const phQuery = `${prompt} site:producthunt.com/products`;
        const phUrl   = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(phQuery)}&num=10&api_key=${SERP}`;
        const phRes   = await fetch(phUrl);
        const phData  = await phRes.json();

        rawProfiles = (phData.organic_results || [])
          .filter(r => (r.link || '').includes('producthunt.com'))
          .map(r => ({
            name:     r.title,
            link:     r.link,
            snippet:  r.snippet,
            platform: 'Product Hunt',
          }));
      } catch (phErr) {
        console.error('Product Hunt error:', phErr);
      }

      if (rawProfiles.length === 0) {
        try {
          const fbUrl  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' startup')}&num=10&api_key=${SERP}`;
          const fbRes  = await fetch(fbUrl);
          const fbData = await fbRes.json();
          rawProfiles  = (fbData.organic_results || []).slice(0, 8).map(r => ({
            name: r.title, link: r.link, snippet: r.snippet, platform: 'Website',
          }));
        } catch {}
      }

    } else if (type === 'E-commerce Brands') {

      try {
        const ecQuery = `${prompt} online store -blog -"top 10" -"best" -theme -template -list`;
        const ecUrl   = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(ecQuery)}&num=10&api_key=${SERP}`;
        const ecRes   = await fetch(ecUrl);
        const ecData  = await ecRes.json();

        rawProfiles = (ecData.organic_results || [])
          .filter(r => {
            const link = (r.link || '').toLowerCase();
            return !link.includes('shopify.com/blog') &&
              !link.includes('oberlo') &&
              !link.includes('omegatheme') &&
              !link.includes('/blog/') &&
              !link.includes('/articles/');
          })
          .map(r => ({
            name: r.title, link: r.link, snippet: r.snippet, platform: 'E-commerce',
          }));
      } catch (ecErr) {
        console.error('E-commerce error:', ecErr);
      }

      if (rawProfiles.length === 0) {
        try {
          const fbUrl  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' ecommerce brand')}&num=10&api_key=${SERP}`;
          const fbRes  = await fetch(fbUrl);
          const fbData = await fbRes.json();
          rawProfiles  = (fbData.organic_results || []).slice(0, 8).map(r => ({
            name: r.title, link: r.link, snippet: r.snippet, platform: 'E-commerce',
          }));
        } catch {}
      }

    } else if (type === 'Coaches & Consultants') {

      try {
        const liQuery = `${prompt} site:linkedin.com/in -recruiter -hiring -jobs`;
        const liUrl   = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(liQuery)}&num=10&api_key=${SERP}`;
        const liRes   = await fetch(liUrl);
        const liData  = await liRes.json();

        rawProfiles = (liData.organic_results || [])
          .filter(r => (r.link || '').includes('linkedin.com/in/'))
          .map(r => ({
            name:     r.title?.replace(' | LinkedIn', '').trim(),
            link:     r.link,
            snippet:  r.snippet,
            platform: 'LinkedIn',
          }));
      } catch (liErr) {
        console.error('LinkedIn error:', liErr);
      }

      if (rawProfiles.length === 0) {
        try {
          const fbUrl  = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(prompt + ' coach consultant')}&num=10&api_key=${SERP}`;
          const fbRes  = await fetch(fbUrl);
          const fbData = await fbRes.json();
          rawProfiles  = (fbData.organic_results || []).slice(0, 8).map(r => ({
            name: r.title, link: r.link, snippet: r.snippet, platform: 'Website',
          }));
        } catch {}
      }
    }

    console.log(`[OppEngine] type=${type} platform=${platform} profiles=${rawProfiles.length} apiWarning=${apiWarning}`);

    // ─────────────────────────────────────────────────────────
    // STEP 2 — Return empty early if truly nothing found
    // Frontend will show "nothing found" message
    // ─────────────────────────────────────────────────────────

    if (rawProfiles.length === 0) {
      return res.status(200).json({
        leads:   [],
        source:  'live',
        empty:   true,
        warning: apiWarning || 'No profiles found for this search. Try a broader prompt.',
      });
    }

    // ─────────────────────────────────────────────────────────
    // STEP 3 — GROQ: Analyse real profiles → return leads
    // ─────────────────────────────────────────────────────────

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ}`,
      },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 2500,
        messages: [{
          role:    'user',
          content: `You are an expert freelance opportunity analyser for a tool called Lancify.

Target type: ${type}
Platform focus: ${platform === 'all' ? 'any platform' : platform}
User is looking for: ${prompt}
Pain signals to check: ${signals.join(', ') || 'any problem signals'}
Budget signals to check: ${budget.join(', ') || 'any budget signals'}

Here are ${rawProfiles.length} REAL profiles from live search:
${JSON.stringify(rawProfiles.slice(0, 8), null, 2)}

STRICT RULES:
- ONLY pick individual creators, channels, or actual businesses
- IGNORE agencies, blogs, marketing companies, theme sites, listicles
- Pick profiles where the person/business has a REAL problem matching the pain signals
- Use REAL name and REAL profileUrl from the data above — never invent URLs
- For YouTube: use subscriberCount field for audience size
- followers: use real data or write "Not listed" — never "no data" or "N/A"
- redFlag: must be a real specific warning string OR the JSON value null — NEVER the text "null"

Return top 3 as a JSON array with EXACTLY these keys:
{
  "name": "real name from the data",
  "platform": "YouTube / Instagram / LinkedIn / Google Maps / Shopify / TikTok",
  "followers": "real audience size e.g. '14.2k subscribers'",
  "problem": "specific problem from their actual profile data — cite real evidence",
  "strategy": "exact outreach strategy for this specific person/business",
  "match": <integer 80-99>,
  "reason": "one sentence why this score",
  "whyNow": "one sentence — why reach out THIS WEEK specifically",
  "redFlag": null,
  "closingHint": "one sentence closing strategy",
  "replyChance": <integer 35-90>,
  "jobDesc": "job description as if they posted on Upwork",
  "profileUrl": "exact URL from the data above — never make this up"
}

Return ONLY the raw JSON array. No explanation. No markdown. No code fences.`,
        }],
      }),
    });

    const groqData = await groqRes.json();
    const rawText  = groqData?.choices?.[0]?.message?.content || '[]';

    let leads = [];
    try {
      leads = JSON.parse(rawText);
    } catch {
      leads = [];
    }

    // Clean up bad values
    leads = leads.map(l => ({
      ...l,
      redFlag: (
        !l.redFlag ||
        l.redFlag === 'null' ||
        l.redFlag === 'None' ||
        l.redFlag === 'none' ||
        l.redFlag === 'N/A' ||
        l.redFlag === ''
      ) ? null : l.redFlag,
      followers: (
        !l.followers ||
        l.followers === 'no data' ||
        l.followers === 'N/A' ||
        l.followers === 'undefined' ||
        l.followers === 'null'
      ) ? 'Not listed' : l.followers,
    }));

    return res.status(200).json({
      leads,
      source:  'live',
      count:   leads.length,
      warning: apiWarning || null,
    });

  } catch (err) {
    console.error('Opportunity Engine fatal error:', err);
    return res.status(500).json({
      error:  err.message || 'Scan failed',
      leads:  [],
      source: 'error',
    });
  }
}
