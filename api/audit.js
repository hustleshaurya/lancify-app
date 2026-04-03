export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { target, platform, weakness, service, price, observation, websiteUrl } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = "gemini-2.5-flash"; 

  let scrapedContent = "";
  let contextSnippet = "";

  // 🕸️ AUTOPILOT: Scrape the website if a URL was passed
  if (websiteUrl && websiteUrl.length > 5) {
    try {
      const jinaResponse = await fetch(`https://r.jina.ai/${websiteUrl}`);
      if (jinaResponse.ok) {
        const fullText = await jinaResponse.text();
        scrapedContent = fullText.substring(0, 3000); 
        contextSnippet = `\n\nThe user provided the client's actual website URL. Scraped text: """${scrapedContent}""". Find a REAL, specific conversion issue from this text (e.g., unclear copy, missing CTA) and base the audit on it. Ignore the manual inputs if they conflict.`;
      }
    } catch (e) {
      console.log("Scraping failed, falling back to manual inputs.");
    }
  }

  if (!contextSnippet) {
    contextSnippet = `\n\nThe client's primary weakness is: "${weakness}". Observation: "${observation}". Base the audit heavily on these points.`;
  }

  // 🧠 THE GOD-LEVEL CONSULTANT PROMPT (V3)
  const prompt = {
    contents: [{
      parts: [{
        text: `You are a highly professional, grounded digital consultant. You are writing an audit for ${target} on ${platform}. You offer a ${service} service for ${price}.

        ${contextSnippet}

        STRICT TONE & STYLE RULES:
        1. Tone: Sound like a real, calm human. Be direct, respectful, and helpful. Speak in the first person ("I").
        2. Banned Words: NO dramatic words ("hemorrhage", "massive loss", "critical failure"). Do NOT use "However" or "My service improves".
        3. Sentences: Keep sentences short (under 15 words). Easy to skim.
        4. Claims & Psychology: Use realistic ranges. Add a tiny, natural emotional trigger based on missed opportunity from high-intent users.

        Return ONLY a JSON object with these exact keys. Follow the structure precisely:
        - "email_script": A cold email. FOLLOW THIS EXACT TEMPLATE: 
          "Subject: Quick thing I noticed on your [page/flow]
          
          Hi [Name],
          I was checking out your [Platform] today — especially the [specific flow/page related to the issue]. The [design/vibe] is [compliment].
          One small thing I noticed: [Point out the specific issue clearly], so users [what annoying thing happens].
          This usually slows down people who are ready to [desired action/booking] quickly.
          I put together a quick 3-point audit showing exactly where this happens and how to fix it.
          Worth a quick look?"
          (DO NOT DEVIATE FROM THIS EMAIL STRUCTURE).
          
        - "sec1_assessment": (The Human Hook) 2 short sentences. Start naturally (e.g., "Quick note — your website looks clean."). Praise one specific good thing.
        - "sec2_bottleneck": (The Problem) 2 short sentences clearly explaining the ONE specific issue avoiding vague terms.
        - "sec3_impact": (The Impact) 2 short sentences explaining how this affects conversions. MUST include an emotional trigger about friction for high-intent users (e.g., "This adds friction for users ready to book immediately, likely costing you 5-10 missed inquiries monthly.").
        - "sec4_fixes": (Quick Fix) An array of exactly 3 clear, actionable improvements the client can understand and implement for free.
        - "sec5_pitch": (The Offer) 2 short sentences presenting your ${service} for ${price}. DO NOT use generic agency speak. Use a specific, result-focused format like: "I can [implement this specific fix] and improve [specific outcome] in 5-7 days for ${price}." End with exactly this: "Happy to show a quick before/after so you can see the impact."`
      }]
    }]
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt)
    });

    const data = await response.json();
    
    if (data.error) throw new Error(data.error.message);
    if (!data.candidates || !data.candidates[0]) throw new Error("AI returned an empty response.");

    let rawText = data.candidates[0].content.parts[0].text;
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: "Lancify Engine Error: " + error.message });
  }
}
