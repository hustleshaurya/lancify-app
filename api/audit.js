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

  // ── 2. SCRAPE URL VIA JINA ────────────────────────────────────────────────
  let scrapedContent = '';
  const urlToScrape = mode === 'quick' ? clientUrl : websiteUrl;
  if (urlToScrape && urlToScrape.length > 5) {
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${urlToScrape}`);
      if (jinaRes.ok) {
        const text = await jinaRes.text();
        scrapedContent = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 6000);
      }
    } catch (e) {
      console.log('Jina scrape failed, continuing with manual inputs.');
    }
  }

  // ── 3. BUILD SKILL × PLATFORM LENS ───────────────────────────────────────
  const SKILL_LENSES = {
    'Web Design & Development': {
      Website: 'CTA clarity, above-fold content, trust badges, page load signals, mobile layout issues, conversion friction, lead capture forms, social proof placement.',
      default: 'Landing page design, conversion elements, visual hierarchy, mobile responsiveness.',
    },
    'SEO & Content Strategy': {
      Website: 'Meta title/description signals, content depth, keyword focus, blog presence, internal linking signals, structured headers, local SEO signals.',
      default: 'Content quality, keyword usage, metadata signals.',
    },
    'Social Media Management': {
      Instagram: 'Bio clarity, link-in-bio effectiveness, posting consistency signals, highlight covers, CTA in bio, engagement hooks in captions, story usage.',
      Facebook: 'Page completeness, posting frequency, CTA button, cover photo, about section, review responses.',
      default: 'Profile completeness, content consistency, engagement signals, CTA strength.',
    },
    'Copywriting & Brand Voice': {
      default: 'Headline strength, value proposition clarity, CTA copy, brand voice consistency, emotional triggers, trust language, objection handling in copy.',
    },
    'Video Editing & Production': {
      YouTube: 'Thumbnail quality and consistency, title clarity and click appeal, description completeness, end screen CTA, playlist structure, channel art.',
      default: 'Video quality signals, thumbnail design, title/description optimization.',
    },
    'Email Marketing': {
      Website: 'Opt-in form visibility, lead magnet presence, popup strategy, newsletter CTA placement, nurture sequence signals.',
      default: 'Email capture strategy, list building signals, CTA placement.',
    },
    'UI/UX Design': {
      Website: 'Navigation clarity, user flow logic, visual hierarchy, friction points in key paths, form design, error state handling, mobile UX.',
      default: 'User flow, navigation structure, visual clarity, interaction design.',
    },
    'Paid Ads & Performance Marketing': {
      Website: 'Landing page-to-ad alignment, offer clarity, trust signals above fold, page speed indicators, conversion elements, retargeting pixel signals.',
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

  // ── 4. BUILD CONTEXT SNIPPET ───────────────────────────────────────────────
  let contextSnippet = '';

  if (scrapedContent) {
    contextSnippet = `
The client's ${detectedPlatform} was scraped. Here is the actual page content:
"""${scrapedContent}"""

Focus lens for ${skillKey} on ${detectedPlatform}: ${focusAreas}

Read the content carefully. Find ONE real, specific friction point a first-time visitor would actually get stuck on.
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
Generate a realistic, specific audit based on common issues you'd find on a typical ${detectedPlatform} profile for a business in this category.`;
  }

  // ── 5. TONE RULES (injected into all prompts) ─────────────────────────────
  const TONE_RULES = `
TONE RULES — NON-NEGOTIABLE:
1. Write like a sharp human consultant, not a marketing bot.
2. Every sentence under 15 words.
3. Be location and detail specific — name exact page sections.
4. Never use: "leverage", "seamless", "game-changer", "innovative", "cutting-edge", "value-driven", "synergy", "however", "hemorrhage", "massive", "critical failure".
5. Use realistic numbers. Don't invent impact percentages above 50%.
6. First person always: "I noticed", "I found", "I can fix".
7. The cold email must feel like a real person wrote it after genuinely browsing the site for 5 minutes.
8. Before finalizing any section: ask "does this sound like AI?" If yes, rewrite it more naturally.
9. Specificity > comprehensiveness. One sharp insight beats five vague ones.
10. Frame everything as opportunity, not failure.`;

  // ── 6. BUILD SYSTEM PROMPT ────────────────────────────────────────────────
  const clientName = mode === 'quick'
    ? (urlToScrape ? (() => { try { return new URL(urlToScrape.startsWith('http') ? urlToScrape : 'https://' + urlToScrape).hostname.replace('www.', '').split('.')[0]; } catch { return 'Client'; } })() : 'Client')
    : (target || 'Client');

  const pitchPrice = mode === 'quick' ? `$${price || 300}` : `$${price || 300}`;
  const pitchTimeline = timeline || '1 week';

  const systemPrompt = `You are a sharp, experienced freelance digital consultant. You write premium audit reports for cold outreach.

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
  "email_subject": "<lowercase, specific, curiosity-driven. Never generic. Max 8 words.>",
  "email_body": "<under 120 words. First person. Mention exactly what you saw. End with a soft, low-commitment ask.>",
  "sec1_assessment": "<2 sentences. Start with something specific you noticed that is genuinely good.>",
  "sec2_bottleneck": "<2 sentences. Name ONE specific friction point. Mention exactly where on the page/profile it is.>",
  "sec3_revenue_leak": {
    "summary": "<2 sentences on where leads are leaking>",
    "funnel_rows": [
      { "stage": "Profile visitors per month", "users": "~1,200", "drop_rate": "—", "lost": "—" },
      { "stage": "Leave: services unclear", "users": "~1,200", "drop_rate": "25%", "lost": "~300" },
      { "stage": "Leave: no trust signals", "users": "~900", "drop_rate": "15%", "lost": "~135" },
      { "stage": "Leave: no CTA", "users": "~765", "drop_rate": "10%", "lost": "~77" },
      { "stage": "Estimated conversions", "users": "~40–60/mo", "drop_rate": "3–5%", "lost": "~120 potential" }
    ],
    "opportunity": "<1 sentence. Realistic revenue opportunity framing. Don't exaggerate.>"
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
      "title": "<short, specific title>",
      "found": "<what exactly was observed, location-specific>",
      "impact": "<plain-language business impact>",
      "fix": "<specific, actionable, free-to-implement fix>",
      "impact_score": <1-10>,
      "ease": "Easy|Medium|Hard",
      "roi": "High|Medium|Low"
    },
    {
      "priority": "CRITICAL",
      "title": "<second critical issue>",
      "found": "<observation>",
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
      "title": "<quick win title>",
      "found": "<observation>",
      "impact": "<impact>",
      "fix": "<fix>",
      "impact_score": <1-10>,
      "ease": "Easy",
      "roi": "Medium|High"
    }
  ],
  "sec6_competitor_insights": [
    { "insight": "<behavioral/psychological framing of what competitors do better>" },
    { "insight": "<second insight>" },
    { "insight": "<third insight>" }
  ],
  "sec7_psychology": [
    { "title": "<psychology principle>", "body": "<2 sentences explaining why visitors behave this way and how to use it>" },
    { "title": "<second principle>", "body": "<2 sentences>" }
  ],
  "sec8_rewrites": [
    {
      "before_title": "Current Version",
      "before": "<actual or representative current copy>",
      "after_title": "Suggested Rewrite",
      "after": "<improved version, specific and actionable>"
    }
  ],
  "sec9_action_plan": [
    { "fix": "<specific fix>", "difficulty": "Easy|Medium|Hard", "impact": "↑↑↑ High|↑↑ Medium|↑ Low", "priority": "Do First|Week 1|Week 2" },
    { "fix": "<fix 2>", "difficulty": "Easy", "impact": "↑↑↑ High", "priority": "Do First" },
    { "fix": "<fix 3>", "difficulty": "Easy", "impact": "↑↑ Medium", "priority": "Week 1" },
    { "fix": "<fix 4>", "difficulty": "Easy", "impact": "↑ Medium", "priority": "Week 2" }
  ],
  "sec5_pitch": "<2 sentences max. Exact deliverables. Expected outcome. Timeframe and price.>"
}`;

  // ── 7. CALL GROQ ──────────────────────────────────────────────────────────
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
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0]) throw new Error("AI returned an empty response.");

    const raw = data.choices[0].message.content;
    const parsed = JSON.parse(raw);
    res.status(200).json(parsed);

  } catch (error) {
    console.error("GROQ API ERROR:", error);
    res.status(500).json({ error: "Lancify Engine Error: " + error.message });
  }
}
