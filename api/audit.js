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

  // 🧠 THE CALM, ELITE CONSULTANT PROMPT
  const prompt = {
    contents: [{
      parts: [{
        text: `You are a highly professional, grounded digital consultant. You are writing an audit for ${target} on ${platform}. You offer a ${service} service for ${price}.

        ${contextSnippet}

        STRICT TONE & STYLE RULES:
        1. Tone: Sound like a real, calm human. Be direct, respectful, and helpful.
        2. Banned Words: NO dramatic or exaggerated words ("hemorrhage", "massive loss", "critical failure", "supercharge", "delve").
        3. Sentences: Keep sentences short (under 15 words). Easy to skim.
        4. Claims: Use realistic ranges (e.g., "5-10 missed inquiries monthly"). Never guarantee results.

        Return ONLY a JSON object with these exact keys. Follow the structure precisely:
        - "email_script": A cold email (under 75 words). Start with curiosity. Point out the specific issue calmly. DO NOT pitch the service here. Invite them to view the attached audit. Soft CTA (e.g., "Worth a quick look?").
        - "sec1_assessment": (The Human Hook) 2 short sentences. Start naturally (e.g., "Quick note — your website looks clean."). Praise one specific good thing.
        - "sec2_bottleneck": (The Problem) 2 short sentences clearly explaining the ONE specific issue avoiding vague terms.
        - "sec3_impact": (The Impact) 2 short sentences explaining how this affects conversions using realistic language and soft ranges (e.g., "This likely costs you 3-5 bookings a week").
        - "sec4_fixes": (Quick Fix) An array of exactly 3 clear, actionable improvements the client can understand and implement for free.
        - "sec5_pitch": (The Offer) 2 short sentences presenting your ${service} for ${price}. Mention a clear outcome and short timeline (e.g., 5-7 days). Use a soft, non-pushy CTA.`
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
