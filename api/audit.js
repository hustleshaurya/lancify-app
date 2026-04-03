export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // We added websiteUrl to the destructured body here
  const { target, platform, weakness, service, price, observation, websiteUrl } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // We are using Gemini 2.5 Flash - the current industry standard for speed/reliability
  const modelName = "gemini-2.5-flash"; 

  let scrapedContent = "";
  let contextSnippet = "";

  // 🕸️ THE AUTOPILOT: Scrape the website if a URL was passed from the frontend
  if (websiteUrl && websiteUrl.length > 5) {
    try {
      // Jina Reader converts any URL into clean text for Gemini
      const jinaResponse = await fetch(`https://r.jina.ai/${websiteUrl}`);
      if (jinaResponse.ok) {
        const fullText = await jinaResponse.text();
        // Take the first 3000 characters (usually the Homepage/Hero section)
        scrapedContent = fullText.substring(0, 3000); 
        contextSnippet = `\n\nCRITICAL INSTRUCTION: The user provided the client's actual website URL. Here is the scraped text from their homepage: """${scrapedContent}""". IGNORE the manual 'weakness' and 'observation' inputs. Find a REAL, specific conversion bottleneck from this scraped text (e.g., confusing copy, missing CTA, bad structure) and base the entire audit on it.`;
      }
    } catch (e) {
      console.log("Scraping failed, falling back to manual inputs.");
    }
  }

  // If no URL was provided or scraping failed, use the manual inputs from the dropdowns
  if (!contextSnippet) {
    contextSnippet = `\n\nThe client's primary weakness is: "${weakness}". A specific observation is: "${observation}". Base the audit heavily on these points.`;
  }

  // 🧠 THE TOP 1% FREELANCER PROMPT
  const prompt = {
    contents: [{
      parts: [{
        text: `You are a ruthless, top 1% growth consultant and conversion rate expert. You are auditing ${target} on ${platform}. 
        You are pitching a ${service} service for ${price}.

        ${contextSnippet}

        STRICT RULES:
        1. NO FLUFF. Do not use words like "delve", "tapestry", "paramount", "landscape", "synergy", or "supercharge".
        2. Keep sentences under 15 words. Be direct, clinical, and highly professional.
        3. Identify a hyper-specific problem (Revenue Leakage, Conversion Friction). 
        4. In Section 3, invent a realistic, conservative mathematical estimate of how much money they are losing per month due to this flaw. Make them feel the pain.

        Return ONLY a JSON object with these exact keys:
        - "email_script": A cold email (under 100 words). Hook them with the specific observation. Offer a quick win. Soft CTA. No "I hope this finds you well".
        - "sec1_assessment": 2 sentences praising a specific good thing about their current setup to lower their guard.
        - "sec2_bottleneck": 2 sentences ruthlessly exposing the exact flaw preventing conversions.
        - "sec3_impact": 2 sentences calculating the estimated lost revenue/clients based on average traffic.
        - "sec4_fixes": An array of exactly 3 short, actionable, hyper-specific bullet points to fix it.
        - "sec5_pitch": 2 sentences positioning your ${service} for ${price} as the logical solution with a 7-day timeline.`
      }]
    }]
  };

  try {
    // Switching to the v1 stable endpoint for maximum reliability
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt)
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    if (!data.candidates || !data.candidates[0]) {
      throw new Error("AI returned an empty response. Check your API quota.");
    }

    // Extract and clean the JSON text
    let rawText = data.candidates[0].content.parts[0].text;
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: "Lancify Engine Error: " + error.message });
  }
}
