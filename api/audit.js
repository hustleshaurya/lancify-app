export const maxDuration = 60; // Increase Vercel function timeout to 60s

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    mode = 'advanced',
    skill,
    clientUrl,
    target,
    platform,
    websiteUrl,
    weakness,
    secondaryWeakness,
    positives,
    service,
    price,
    timeline,
    observation,
  } = req.body;

  const groqApiKey = process.env.GROQ_API_KEY;
  const apifyToken = process.env.APIFY_API_TOKEN;
  const youtubeApiKey = process.env.YOUTUBE_API_KEY; // Same key already used in opportunity.js
  const modelName = "llama-3.3-70b-versatile";

  // ── 1. DETECT PLATFORM FROM URL ──────────────────────────────────────────
  function detectPlatform(url) {
    if (!url) return platform || 'Website';
    const map = [
      ['instagram.com', 'Instagram'], ['facebook.com', 'Facebook'],
      ['linkedin.com', 'LinkedIn'], ['youtube.com', 'YouTube'],
      ['youtu.be', 'YouTube'], ['yelp.com', 'Yelp'],
      ['tiktok.com', 'TikTok'], ['twitter.com', 'Twitter'],
      ['x.com', 'Twitter'], ['google.com/maps', 'Google Business'],
    ];
    for (const [host, label] of map) {
      if (url.includes(host)) return label;
    }
    return 'Website';
  }

  const detectedPlatform = mode === 'quick'
    ? detectPlatform(clientUrl)
    : (platform || 'Website');

  // ── 2. EXTRACT INSTAGRAM USERNAME FROM URL ────────────────────────────────
  function extractInstagramUsername(url) {
    try {
      const u = url.startsWith('http') ? url : 'https://' + url;
      const parsed = new URL(u);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length > 0) return parts[0];
    } catch (e) {}
    return null;
  }

  // ── 3. SCRAPE INSTAGRAM VIA APIFY ─────────────────────────────────────────
  async function scrapeInstagramWithApify(username) {
    if (!apifyToken || !username) return null;
    try {
      console.log(`[Apify] Scraping Instagram profile: ${username}`);

      // Start the Apify Instagram Scraper actor run
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${apifyToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directUrls: [`https://www.instagram.com/${username}/`],
            resultsType: 'details',
            resultsLimit: 1,
            addParentData: false,
          }),
        }
      );

      if (!runRes.ok) {
        console.log('[Apify] Failed to start actor run:', await runRes.text());
        return null;
      }

      const runData = await runRes.json();
      const runId = runData?.data?.id;
      if (!runId) return null;

      console.log(`[Apify] Run started: ${runId}, polling for results...`);

      // Poll for completion (max 45s)
      const maxWait = 45000;
      const pollInterval = 3000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));

        const statusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
        );
        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();
        const status = statusData?.data?.status;
        console.log(`[Apify] Run status: ${status}`);

        if (status === 'SUCCEEDED') {
          const datasetId = statusData?.data?.defaultDatasetId;
          if (!datasetId) return null;

          const itemsRes = await fetch(
            `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&limit=1`
          );
          if (!itemsRes.ok) return null;

          const items = await itemsRes.json();
          if (!items || items.length === 0) return null;

          const profile = items[0];
          console.log(`[Apify] Got profile data for: ${profile.username}`);
          return profile;
        }

        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
          console.log(`[Apify] Run ended with status: ${status}`);
          return null;
        }
      }

      console.log('[Apify] Polling timed out');
      return null;
    } catch (e) {
      console.log('[Apify] Error:', e.message);
      return null;
    }
  }

  // ── 4. FORMAT APIFY INSTAGRAM DATA INTO CONTEXT ───────────────────────────
  function formatInstagramData(profile) {
    if (!profile) return null;
    const {
      username, fullName, biography, followersCount, followingCount,
      postsCount, isVerified, isBusinessAccount, businessCategoryName,
      externalUrl, latestPosts, highlightReelCount,
      igtvVideoCount, hasChannel,
    } = profile;

    const recentPosts = (latestPosts || []).slice(0, 6).map((p, i) => {
      const likes = p.likesCount || 0;
      const comments = p.commentsCount || 0;
      const caption = (p.caption || '').slice(0, 120);
      const type = p.type || 'GraphImage';
      return `  Post ${i+1}: ${type} | ${likes} likes | ${comments} comments | Caption: "${caption}"`;
    }).join('\n');

    const recentPostsArr = (latestPosts || []).slice(0, 6);
    const avgLikes = recentPostsArr.length > 0
      ? Math.round(recentPostsArr.reduce((s, p) => s + (p.likesCount || 0), 0) / recentPostsArr.length)
      : 0;
    const avgComments = recentPostsArr.length > 0
      ? Math.round(recentPostsArr.reduce((s, p) => s + (p.commentsCount || 0), 0) / recentPostsArr.length)
      : 0;
    const engagementRate = followersCount > 0
      ? ((avgLikes + avgComments) / followersCount * 100).toFixed(2)
      : '0.00';

    return `
REAL INSTAGRAM PROFILE DATA (scraped live via Apify):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Username: @${username}
Full Name: ${fullName || 'Not set'}
Bio: "${biography || 'No bio set'}"
Followers: ${(followersCount || 0).toLocaleString()}
Following: ${(followingCount || 0).toLocaleString()}
Total Posts: ${postsCount || 0}
Verified: ${isVerified ? 'YES' : 'No'}
Business Account: ${isBusinessAccount ? 'YES — Category: ' + (businessCategoryName || 'Unknown') : 'No (Personal account)'}
External Link in Bio: ${externalUrl || 'NONE — no link set'}
Highlights: ${highlightReelCount || 0} highlight reels
IGTV Videos: ${igtvVideoCount || 0} | Has Channel: ${hasChannel ? 'Yes' : 'No'}

RECENT POSTS (last ${recentPostsArr.length} posts):
${recentPosts || 'No recent posts found'}

ENGAGEMENT METRICS:
  Average Likes per Post: ${avgLikes}
  Average Comments per Post: ${avgComments}
  Estimated Engagement Rate: ${engagementRate}%
  (Industry benchmarks: below 1% = poor, 1-3% = average, 3-6% = good, 6%+ = excellent)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }


  // ── 5a. EXTRACT YOUTUBE CHANNEL ID OR HANDLE FROM URL ─────────────────────
  function extractYouTubeIdentifier(url) {
    try {
      const u = url.startsWith('http') ? url : 'https://' + url;
      // youtu.be/VIDEO_ID
      const youtubeBeMatch = u.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (youtubeBeMatch) return { type: 'video', value: youtubeBeMatch[1] };
      // youtube.com/watch?v=VIDEO_ID
      const watchMatch = u.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (watchMatch) return { type: 'video', value: watchMatch[1] };
      const parsed = new URL(u);
      const path = parsed.pathname;
      // /channel/UCxxxxxx
      const channelMatch = path.match(/\/channel\/(UC[\w-]+)/);
      if (channelMatch) return { type: 'id', value: channelMatch[1] };
      // /@handle or /c/handle or /user/handle
      const handleMatch = path.match(/\/(?:@|c\/|user\/)([\w.-]+)/);
      if (handleMatch) return { type: 'handle', value: handleMatch[1] };
      // youtu.be or bare path
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 0) return { type: 'handle', value: parts[0].replace('@', '') };
    } catch (e) {}
    return null;
  }

  // ── 5b. SCRAPE YOUTUBE CHANNEL VIA OFFICIAL DATA API v3 ───────────────────
  async function scrapeYouTubeChannel(identifier) {
    if (!youtubeApiKey) {
      console.log('[Audit][YouTube] missing YouTube API key');
      return null;
    }
    if (!identifier) {
      console.log('[Audit][YouTube] missing identifier');
      return null;
    }
    try {
      console.log('[Audit][YouTube] identifier type:', identifier.type, 'value:', identifier.value);

      let channelId = null;
      let specificVideo = null;

      if (identifier.type === 'id') {
        channelId = identifier.value;
      } else if (identifier.type === 'video') {
        const specificVideoRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics` +
          `&id=${identifier.value}&key=${youtubeApiKey}`
        );
        console.log('[Audit][YouTube] specific video fetch status:', specificVideoRes.status);
        if (!specificVideoRes.ok) {
          console.log('[Audit][YouTube] video lookup failed for:', identifier.value);
          return null;
        }
        const specificVideoData = await specificVideoRes.json();
        specificVideo = specificVideoData?.items?.[0] || null;
        channelId = specificVideo?.snippet?.channelId;
        if (!channelId) {
          console.log('[Audit][YouTube] video lookup returned no channelId for:', identifier.value);
          return null;
        }
      } else {
        // Resolve handle → channel ID via search
        const searchRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel` +
          `&q=${encodeURIComponent(identifier.value)}&maxResults=1&key=${youtubeApiKey}`
        );
        console.log('[Audit][YouTube] handle search status:', searchRes.status);
        if (!searchRes.ok) {
          console.log('[Audit][YouTube] handle search failed for:', identifier.value);
          return null;
        }
        const searchData = await searchRes.json();
        channelId = searchData?.items?.[0]?.id?.channelId;
        if (!channelId) {
          console.log('[Audit][YouTube] handle search returned no channelId for:', identifier.value);
          return null;
        }
      }
      console.log('[Audit][YouTube] resolved channelId:', channelId);

      // Fetch channel details
      const [channelRes, videosRes] = await Promise.all([
        fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings` +
          `&id=${channelId}&key=${youtubeApiKey}`
        ),
        fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}` +
          `&type=video&order=date&maxResults=6&key=${youtubeApiKey}`
        ),
      ]);

      console.log('[Audit][YouTube] channel fetch status:', channelRes.status);
      console.log('[Audit][YouTube] recent videos fetch status:', videosRes.status);
      if (!channelRes.ok) {
        console.log('[Audit][YouTube] channel fetch failed for channelId:', channelId);
        return null;
      }
      const channelData = await channelRes.json();
      const channel = channelData?.items?.[0];
      if (!channel) {
        console.log('[Audit][YouTube] channel fetch returned no channel item for channelId:', channelId);
        return null;
      }

      const videosData = videosRes.ok ? await videosRes.json() : null;
      const recentVideoIds = (videosData?.items || []).map(v => v.id?.videoId).filter(Boolean);
      console.log('[Audit][YouTube] recent video ID count:', recentVideoIds.length);

      // Fetch video stats
      let videoDetails = [];
      if (recentVideoIds.length > 0) {
        const statsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics` +
          `&id=${recentVideoIds.join(',')}&key=${youtubeApiKey}`
        );
        console.log('[Audit][YouTube] video stats fetch status:', statsRes.status);
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          videoDetails = statsData?.items || [];
        } else {
          console.log('[Audit][YouTube] video stats fetch failed for channelId:', channelId);
        }
      }
      console.log('[Audit][YouTube] videoDetails count:', videoDetails.length);

      return { channel, videoDetails, specificVideo };
    } catch (e) {
      console.log('[Audit][YouTube] API error:', e.message);
      return null;
    }
  }

  // ── 5c. FORMAT YOUTUBE DATA INTO AUDIT CONTEXT ────────────────────────────
  function formatYouTubeData(data) {
    if (!data?.channel) return null;
    const { channel, specificVideo } = data;
    const videoDetails = data.videoDetails || [];
    const snippet = channel.snippet || {};
    const stats = channel.statistics || {};
    const branding = channel.brandingSettings?.channel || {};

    const subs = parseInt(stats.subscriberCount || 0);
    const totalViews = parseInt(stats.viewCount || 0);
    const videoCount = parseInt(stats.videoCount || 0);
    const avgViewsPerVideo = videoCount > 0 ? Math.round(totalViews / videoCount) : 0;

    const recentVideos = videoDetails.map((v, i) => {
      const vs = v.statistics || {};
      const vsnip = v.snippet || {};
      const views = parseInt(vs.viewCount || 0);
      const likes = parseInt(vs.likeCount || 0);
      const comments = parseInt(vs.commentCount || 0);
      const title = (vsnip.title || '').slice(0, 80);
      const publishedAt = (vsnip.publishedAt || '').slice(0, 10);
      return `  Video ${i+1}: "${title}" | ${views.toLocaleString()} views | ${likes} likes | ${comments} comments | ${publishedAt}`;
    }).join('\n');

    const recentAvgViews = videoDetails.length > 0
      ? Math.round(videoDetails.reduce((s, v) => s + parseInt(v.statistics?.viewCount || 0), 0) / videoDetails.length)
      : 0;

    const viewSubRatio = subs > 0 ? (recentAvgViews / subs).toFixed(3) : '0.000';
    const hasBannerArt = !!branding.bannerExternalUrl;
    const hasDescription = !!(snippet.description && snippet.description.length > 50);
    const descPreview = (snippet.description || 'No description').slice(0, 200);
    const keywords = (branding.keywords || 'None listed').slice(0, 150);
    const country = snippet.country || 'Not set';
    const customUrl = snippet.customUrl || 'No custom URL';
    const specificVideoSection = specificVideo ? `
SPECIFIC VIDEO SHARED BY USER:
Title: ${specificVideo.snippet?.title || 'Unknown'}
Views: ${parseInt(specificVideo.statistics?.viewCount || 0).toLocaleString()} | Likes: ${parseInt(specificVideo.statistics?.likeCount || 0).toLocaleString()} | Comments: ${parseInt(specificVideo.statistics?.commentCount || 0).toLocaleString()}
Published: ${(specificVideo.snippet?.publishedAt || '').slice(0, 10) || 'Unknown'}
Description preview: "${(specificVideo.snippet?.description || 'No description').slice(0, 200)}"
` : '';

    return `
REAL YOUTUBE CHANNEL DATA (fetched live via YouTube Data API v3):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${specificVideoSection}
Channel Name: ${snippet.title || 'Unknown'}
Handle / Custom URL: ${customUrl}
Country: ${country}
Subscribers: ${subs.toLocaleString()}
Total Videos: ${videoCount.toLocaleString()}
Total Views: ${totalViews.toLocaleString()}
Avg Views Per Video (all-time): ${avgViewsPerVideo.toLocaleString()}
Avg Views Per Video (recent 6): ${recentAvgViews.toLocaleString()}
View/Sub Ratio (recent): ${viewSubRatio} (benchmark: 0.1+ is strong, below 0.05 = low engagement)
Has Banner Art: ${hasBannerArt ? 'Yes' : 'NO — missing channel art'}
hasBannerArt = ${hasBannerArt}
Has Description: ${hasDescription ? 'Yes' : 'NO — about section empty or very short'}
Channel Description Length: ${(snippet.description || '').length} characters
Channel Keywords: ${keywords}
Channel Description Preview: "${descPreview}..."

RECENT 6 VIDEOS:
${recentVideos || 'No recent videos found'}

ENGAGEMENT SIGNALS:
  If view/sub ratio < 0.05: thumbnails and titles need work (click-through problem)
  If subs > 10K but avg views < 500: retention or algorithm signal issue
  If no banner art: profile presentation is incomplete — affects first impressions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  // ── 5. SCRAPE URL VIA JINA (for non-Instagram URLs) ───────────────────────
  let scrapedContent = '';
  const urlToScrape = mode === 'quick' ? clientUrl : websiteUrl;
  let instagramProfileData = null;
  let scrapedClientName = null;

  if (detectedPlatform === 'Instagram' && mode === 'quick') {
    // Use Apify for Instagram — structured profile data
    const username = extractInstagramUsername(urlToScrape);
    if (username) {
      const profile = await scrapeInstagramWithApify(username);
      instagramProfileData = formatInstagramData(profile);
      if (instagramProfileData) {
        scrapedContent = instagramProfileData;
        scrapedClientName = profile?.fullName || profile?.username || null;
      }
    }
  } else if (detectedPlatform === 'YouTube' && mode === 'quick') {
    // Use YouTube Data API v3 — official, reliable, same key as opportunity.js
    const ytIdentifier = extractYouTubeIdentifier(urlToScrape);
    if (ytIdentifier) {
      const ytData = await scrapeYouTubeChannel(ytIdentifier);
      if (!ytData) {
        console.log('[Audit][YouTube] Scrape failed - falling back to no-data mode for:', urlToScrape);
      }
      const ytFormatted = formatYouTubeData(ytData);
      if (ytFormatted) {
        scrapedContent = ytFormatted;
        scrapedClientName = ytData?.channel?.snippet?.title || null;
      }
    } else {
      console.log('[Audit][YouTube] Could not extract YouTube identifier from:', urlToScrape);
    }
  } else if (urlToScrape && urlToScrape.length > 5) {
    // Use Jina for all other platforms (websites, Yelp, LinkedIn, etc.)
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${urlToScrape}`);
      if (jinaRes.ok) {
        const text = await jinaRes.text();
        scrapedContent = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 6000);
      }
    } catch (e) {
      console.log('[Audit][Jina] scrape failed, continuing with manual inputs:', e.message);
    }
  }

  // ── 6. BUILD SKILL × PLATFORM LENS ───────────────────────────────────────
  const SKILL_LENSES = {
    'Web Design & Development': {
      Website: 'CTA clarity, above-fold content, trust badges, page load signals, mobile layout issues, conversion friction, lead capture forms, social proof placement.',
      YouTube: 'Channel homepage layout, external links section, banner design, about page completeness, website link in channel links, video end screen CTA design, community tab presence.',
      default: 'Landing page design, conversion elements, visual hierarchy, mobile responsiveness.',
    },
    'SEO & Content Strategy': {
      Website: 'Meta title/description signals, content depth, keyword focus, blog presence, internal linking signals, structured headers, local SEO signals.',
      YouTube: 'Video title keyword optimization, description keyword depth, tags usage, chapter markers for SEO, search-intent alignment of titles, playlist organization for topic clusters, closed captions.',
      default: 'Content quality, keyword usage, metadata signals.',
    },
    'Social Media Management': {
      Instagram: 'Bio clarity and keyword optimization, link-in-bio effectiveness, posting consistency (frequency and gaps), highlight covers structure, CTA in bio, engagement rate vs follower count benchmark, hashtag strategy, caption hooks, story usage signals, content variety (Reels vs static vs carousel), brand voice consistency, comment response rate.',
      YouTube: 'Upload frequency and consistency, view/subscriber ratio trend, community tab usage, Shorts vs long-form balance, playlist structure and naming, comment response rate, channel branding consistency, subscriber-to-view engagement gap signals.',
      Facebook: 'Page completeness, posting frequency, CTA button, cover photo, about section, review responses.',
      default: 'Profile completeness, content consistency, engagement signals, CTA strength.',
    },
    'Copywriting & Brand Voice': {
      Instagram: 'Bio copy clarity, value proposition in bio, CTA strength in bio and captions, caption hook quality, storytelling vs promotional balance, brand voice consistency across posts.',
      YouTube: 'Video title hook strength and click appeal, description opening line quality, CTA copy in descriptions, channel description value proposition, end screen copy, community post copy quality.',
      default: 'Headline strength, value proposition clarity, CTA copy, brand voice consistency, emotional triggers, trust language, objection handling in copy.',
    },
    'Video Editing & Production': {
      YouTube: 'Thumbnail quality and consistency, title clarity and click appeal, description completeness, end screen CTA, playlist structure, channel art.',
      Instagram: 'Reel quality and consistency, video hook strength (first 3 seconds), caption engagement, thumbnail covers for Reels, editing style consistency.',
      default: 'Video quality signals, thumbnail design, title/description optimization.',
    },
    'Email Marketing': {
      Website: 'Opt-in form visibility, lead magnet presence, popup strategy, newsletter CTA placement, nurture sequence signals.',
      Instagram: 'Link-in-bio email capture, lead magnet mentions in posts, story swipe-up to email opt-in, newsletter promotion in captions.',
      default: 'Email capture strategy, list building signals, CTA placement.',
    },
    'UI/UX Design': {
      Website: 'Navigation clarity, user flow logic, visual hierarchy, friction points in key paths, form design, error state handling, mobile UX.',
      Instagram: 'Visual grid coherence, profile aesthetic consistency, highlight cover design quality, story template consistency, branded content elements.',
      default: 'User flow, navigation structure, visual clarity, interaction design.',
    },
    'Paid Ads & Performance Marketing': {
      Website: 'Landing page-to-ad alignment, offer clarity, trust signals above fold, page speed indicators, conversion elements, retargeting pixel signals.',
      Instagram: 'Ad-ready content quality, offer clarity in posts, engagement rate as audience warmth signal, CTA strength in posts and bio.',
      YouTube: 'In-video CTA placement and clarity, link in description above the fold, channel page conversion funnel, sponsorship or product offer framing, end screen and card CTA optimization.',
      Facebook: 'Ad creative quality, landing page relevance, audience targeting signals, offer clarity.',
      default: 'Landing page conversion elements, offer clarity, trust signals, CTA strength.',
    },
    'Yelp / Google Business Optimization': {
      Yelp: 'Profile completeness, review response rate, photo count and quality, service clarity, CTA presence, trust signals, competitor positioning, emergency service signaling.',
      'Google Business': 'Profile completeness, review management, photo optimization, service descriptions, Q&A section, business hours accuracy, post frequency.',
      default: 'Profile completeness, review strategy, trust signals, CTA presence.',
    },
  };

  const skillKey = skill || service || 'Web Design & Development';
  const lensObj = SKILL_LENSES[skillKey] || SKILL_LENSES['Web Design & Development'];
  const focusAreas = lensObj[detectedPlatform] || lensObj['default'] || lensObj[Object.keys(lensObj)[0]];

  // ── 7. BUILD CONTEXT SNIPPET ───────────────────────────────────────────────
  // Determine if we have structured platform data (Instagram/YouTube) vs raw page scrape
  const hasStructuredData = !!(instagramProfileData || (detectedPlatform === 'YouTube' && scrapedContent));
  let contextSnippet = '';

  if (scrapedContent && hasStructuredData) {
    const platformLabel = detectedPlatform === 'Instagram' ? 'Instagram' : 'YouTube channel';
    const specificInstructions = detectedPlatform === 'YouTube'
      ? `- Use actual subscriber count, view/sub ratio, recent video titles and view counts in your analysis.
- If view/sub ratio is below 0.05, flag thumbnail/title CTR as a critical issue.
- If avg views are low vs subscribers, flag retention or algorithm issues.
- If no banner art or empty description, flag it as a quick win.
- You MUST quote at least 2 specific video titles from the data above verbatim.
- You MUST cite the exact subscriber count and recent avg view count in sec1_assessment.
- You MUST reference the view/sub ratio with its exact value in sec2_bottleneck.
- In sec8_rewrites, the "before" must be the ACTUAL channel description text from the data above, not a placeholder.
- In the email_body, open with a specific observation about a real video title or their exact view/sub ratio.
- If the channel has no banner art (hasBannerArt = false), this MUST appear as a CRITICAL issue in sec5_issues.
- If the channel description is under 100 characters, flag it as a HIGH issue.
- Health score must be calculated from sec4_scores average, not invented separately.`
      : `- Use actual engagement rate, follower count, bio text, and post patterns in your analysis.
- If engagement rate is below 1%, flag it as critical. If no link in bio, that is a critical miss.
- Reference specific caption text or post types from the real data.`;

    contextSnippet = `
${scrapedContent}

Your freelance skill being offered: ${skillKey}
Focus lens for ${skillKey} on ${detectedPlatform}: ${focusAreas}

CRITICAL INSTRUCTIONS:
- Base your ENTIRE audit on the REAL ${platformLabel} data above. Every claim must reference actual numbers.
- Identify the most critical friction points a ${skillKey} freelancer can specifically fix.
${specificInstructions}
- Frame ALL recommendations around what ${skillKey} can specifically deliver as a fix.
- The cold email must mention at least ONE specific real detail (subscriber count, view count, video title, bio text, etc.).
- Do NOT invent data. Every number cited must come from the data above.`;
  } else if (scrapedContent) {
    contextSnippet = `
The client's ${detectedPlatform} was scraped. Here is the actual page content:
"""${scrapedContent}"""

Focus lens for ${skillKey} on ${detectedPlatform}: ${focusAreas}

Read the content carefully. Find real, specific friction points a first-time visitor would actually get stuck on.
Do NOT make up generic problems. Base the entire audit on what you actually see in the content above.`;
  } else if (mode === 'advanced') {
    contextSnippet = `
Primary issue found by the freelancer: "${weakness}".
${secondaryWeakness ? `Secondary issue: "${secondaryWeakness}".` : ''}
${positives ? `What's working well: "${positives}".` : ''}
${observation ? `Additional observation: "${observation}".` : ''}

Focus lens for ${skillKey} on ${detectedPlatform}: ${focusAreas}

Base the entire audit on these specific issues. Use the focus areas to frame recommendations.`;
  } else {
    contextSnippet = `
No scraped content available. Use your knowledge of ${detectedPlatform} best practices for ${skillKey}.
Focus lens: ${focusAreas}
Generate a realistic, specific audit based on common issues for a ${detectedPlatform} profile in this niche.`;
  }

  // ── 8. TONE RULES ─────────────────────────────────────────────────────────
  const TONE_RULES = `
TONE RULES — NON-NEGOTIABLE:
1. Write like a sharp human consultant, not a marketing bot.
2. Every sentence under 15 words.
3. Be location and detail specific — name exact profile sections, bio lines, post types.
4. Never use: "leverage", "seamless", "game-changer", "innovative", "cutting-edge", "value-driven", "synergy", "however", "hemorrhage", "massive", "critical failure".
5. Use realistic numbers. Don't invent impact percentages above 50%.
6. First person always: "I noticed", "I found", "I can fix".
7. The cold email must feel like a real person wrote it after genuinely browsing the profile for 5 minutes.
8. Before finalizing any section: ask "does this sound like AI?" If yes, rewrite it more naturally.
9. Specificity > comprehensiveness. One sharp insight beats five vague ones.
10. Frame everything as opportunity, not failure.
11. Make the report feel paid: executive, decisive, and easy to approve.
12. Tie each fix to money, trust, speed, or missed replies.
13. Use client-ready language the freelancer can send without editing.
14. Do not apologize, hedge, or over-explain methodology.`;

  // ── 9. BUILD SYSTEM PROMPT ────────────────────────────────────────────────
  const clientName = mode === 'quick'
    ? (scrapedClientName || (urlToScrape ? (() => {
        try {
          const u = urlToScrape.startsWith('http') ? urlToScrape : 'https://' + urlToScrape;
          const host = new URL(u).hostname.replace('www.', '').split('.')[0];
          if (detectedPlatform === 'Instagram') {
            return extractInstagramUsername(urlToScrape) || host;
          }
          return host;
        } catch { return 'Client'; }
      })() : 'Client'))
    : (target || 'Client');

  const cleanPrice = String(price || 300).trim();
  const pitchPrice = cleanPrice.startsWith('$') ? cleanPrice : `$${cleanPrice}`;
  const pitchTimeline = timeline || '1 week';

  const systemPrompt = `You are a senior freelance growth consultant writing a premium conversion audit that helps a prospect quickly say yes.
This report will be exported as a polished PDF, so the content must feel executive, specific, and launch-ready.

You are auditing: ${clientName}
Platform: ${detectedPlatform}
Your skill/service: ${skillKey}
Your pitch price: ${pitchPrice}
Timeline: ${pitchTimeline}

${contextSnippet}

---
${TONE_RULES}
---

Return ONLY a valid JSON object. No markdown, no backticks, no preamble. Use EXACTLY this structure:

{
  "client_name": "${clientName}",
  "platform": "${detectedPlatform}",
  "health_score": <number 0-100, realistic based on what you found>,
  "email_subject": "<lowercase, specific, curiosity-driven. Reference something real. Max 8 words.>",
  "email_body": "<under 120 words. First person. Mention something SPECIFIC from the real profile. End with a soft ask that is easy to reply to.>",
  "sec1_assessment": "<2 sentences. Start with one specific positive signal, then state the business opportunity in plain language.>",
  "sec2_bottleneck": "<2 sentences. Name ONE specific friction point with exact location on the profile and why it delays a buyer decision.>",
  "sec3_revenue_leak": {
    "summary": "<2 sentences on where leads are leaking and what behavior causes the leak>",
    "funnel_rows": [
      { "stage": "Profile visitors per month", "users": "<realistic estimate>", "drop_rate": "—", "lost": "—" },
      { "stage": "Leave: unclear value proposition", "users": "<number>", "drop_rate": "<realistic %>", "lost": "<number>" },
      { "stage": "Leave: no trust signals", "users": "<number>", "drop_rate": "<realistic %>", "lost": "<number>" },
      { "stage": "Leave: no clear CTA", "users": "<number>", "drop_rate": "<realistic %>", "lost": "<number>" },
      { "stage": "Estimated conversions", "users": "<range>", "drop_rate": "<rate>", "lost": "<potential>" }
    ],
    "opportunity": "<1 sentence. Realistic revenue opportunity with a conservative assumption. No exaggeration.>"
  },
  "sec4_scores": [
    { "label": "Profile Completeness", "score": <number>, "max": 10 },
    { "label": "Trust Signals", "score": <number>, "max": 10 },
    { "label": "Clarity of Services", "score": <number>, "max": 10 },
    { "label": "Call-to-Action Strength", "score": <number>, "max": 10 },
    { "label": "Visual Quality", "score": <number>, "max": 10 },
    { "label": "Review/Social Proof", "score": <number>, "max": 10 },
    { "label": "Competitor Positioning", "score": <number>, "max": 10 },
    { "label": "Mobile Experience", "score": <number>, "max": 10 }
  ],
  "sec5_issues": [
    {
      "priority": "CRITICAL",
      "title": "<short specific title>",
      "found": "<exact observation with location — quote real bio text if available, cite real numbers>",
      "impact": "<plain-language business impact tied to trust, replies, bookings, or conversion>",
      "fix": "<specific actionable fix the freelancer can deliver with a visible deliverable>",
      "impact_score": <1-10>,
      "ease": "Easy|Medium|Hard",
      "roi": "High|Medium|Low"
    },
    {
      "priority": "CRITICAL",
      "title": "<second critical issue>",
      "found": "<observation with specific location>",
      "impact": "<impact>",
      "fix": "<fix>",
      "impact_score": <1-10>,
      "ease": "Easy|Medium|Hard",
      "roi": "High|Medium|Low"
    },
    {
      "priority": "HIGH",
      "title": "<high priority issue>",
      "found": "<observation>",
      "impact": "<impact>",
      "fix": "<fix>",
      "impact_score": <1-10>,
      "ease": "Easy|Medium|Hard",
      "roi": "High|Medium|Low"
    },
    {
      "priority": "QUICK WIN",
      "title": "<quick win — implementable in under 30 min>",
      "found": "<observation>",
      "impact": "<impact>",
      "fix": "<specific fix with time estimate>",
      "impact_score": <1-10>,
      "ease": "Easy",
      "roi": "Medium|High"
    }
  ],
  "sec6_competitor_insights": [
    { "insight": "<what top competitors in this niche do differently — psychological framing>" },
    { "insight": "<second competitor advantage insight>" },
    { "insight": "<third insight>" }
  ],
  "sec7_psychology": [
    { "title": "<psychology principle name>", "body": "<2 sentences on why visitors behave this way and how to use it>" },
    { "title": "<second principle>", "body": "<2 sentences>" }
  ],
  "sec8_rewrites": [
    {
      "before_title": "Current Version",
      "before": "<actual current bio/caption text if scraped, or representative current copy>",
      "after_title": "Suggested Rewrite",
      "after": "<improved version, specific to their niche, platform, and audience>"
    }
  ],
  "sec9_action_plan": [
    { "fix": "<specific fix with exact deliverable>", "difficulty": "Easy|Medium|Hard", "impact": "High|Medium|Low", "priority": "Do First|Week 1|Week 2" },
    { "fix": "<fix 2>", "difficulty": "Easy", "impact": "High", "priority": "Do First" },
    { "fix": "<fix 3>", "difficulty": "Easy", "impact": "Medium", "priority": "Week 1" },
    { "fix": "<fix 4>", "difficulty": "Easy", "impact": "Medium", "priority": "Week 2" }
  ],
  "sec5_pitch": "<2 sentences max. Write this as the close of a premium proposal: exact deliverables, expected outcome, ${pitchTimeline} timeline, and ${pitchPrice} price.>"
}`;

  // ── 10. CALL GROQ ──────────────────────────────────────────────────────────
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.7,
        response_format: { type: "json_object" },
        max_tokens: 4000,
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0]) throw new Error("AI returned an empty response.");

    const raw = data.choices[0].message.content;
    const parsed = JSON.parse(raw);
    if (parsed.sec4_scores && parsed.sec4_scores.length > 0) {
      const totalPoints = parsed.sec4_scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
      const maxPoints = parsed.sec4_scores.reduce((sum, s) => sum + (Number(s.max) || 10), 0);
      if (maxPoints > 0) {
        parsed.health_score = Math.round((totalPoints / maxPoints) * 100);
      }
    }
    res.status(200).json(parsed);

  } catch (error) {
    console.error("GROQ API ERROR:", error);
    res.status(500).json({ error: "Lancify Engine Error: " + error.message });
  }
}
