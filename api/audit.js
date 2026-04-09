export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { target, platform, weakness, service, price, observation, websiteUrl } = req.body;
  
  // Pivot: Using the reliable Groq API instead of Gemini
  const groqApiKey = process.env.GROQ_API_KEY;
  const modelName = "llama-3.3-70b-versatile";

  let scrapedContent = "";
  let contextSnippet = "";

  // 🕸️ AUTOPILOT: Scrape the website if a URL was passed
  if (websiteUrl && websiteUrl.length > 5) {
    try {
      const jinaResponse = await fetch(`https://r.jina.ai/${websiteUrl}`);
      if (jinaResponse.ok) {
        const fullText = await jinaResponse.text();
        scrapedContent = fullText.substring(0, 6000); // 6k chars is perfect for Llama
        contextSnippet = `
The client's website was scraped. Here is the actual page content:
"""${scrapedContent}"""

Read this carefully. Find ONE real, specific friction point — something a first-time visitor would actually get stuck on. 
This could be: unclear CTA, confusing navigation, missing trust signals, vague service descriptions, no pricing visible, no social proof, etc.
Base the entire audit on this ONE specific real issue. Do not make up a generic problem.`;
      }
    } catch (e) {
      console.log("Scraping failed, falling back to manual inputs.");
    }
  }

  if (!contextSnippet) {
    contextSnippet = `
The client's primary weakness is: "${weakness}".
Additional observation: "${observation}".
Base the entire audit on this specific issue. Do not generalise.`;
  }

  const systemPrompt = `You are a sharp, experienced freelance digital consultant. You write audit reports and cold emails for potential clients.

You are auditing: ${target}
Platform: ${platform}
Your service: ${service}
Your price: ${price}

${contextSnippet}

---

YOUR WRITING RULES (follow strictly):
1. Sound like a real human, not a marketing tool. Write like you're sending this from your laptop on a Tuesday afternoon.
2. Sentences must be short — under 15 words each. Easy to skim.
3. Be specific. If you mention an issue, name exactly where on the page it is.
4. Never use these words or phrases: "hemorrhage", "massive", "critical failure", "game-changer", "seamless", "leverage", "synergy", "however", "value-driven", "aha moment", "my service improves", "innovative", "cutting-edge".
5. Do not pad. Every sentence must earn its place.
6. Use realistic numbers. Don't exaggerate impact.
7. Write in first person ("I noticed", "I can fix").
8. The cold email must NOT sound like a template. It should feel like a real person wrote it after genuinely browsing the site for 5 minutes.
9. Before finalizing any section, ask yourself: "Does this sound like AI wrote it?" If yes, rewrite it more naturally before including it.

---

Return ONLY a valid JSON object. No markdown, no backticks, no explanation. Use exactly this JSON structure:
{
  "email_subject": "A lowercase, specific, curiosity-driven subject line. Never generic.",
  "email_body": "The cold email body. Keep it under 120 words total. Close with a direct, low-commitment ask.",
  "sec1_assessment": "2 sentences. Start with something specific you noticed that is actually good about the site.",
  "sec2_bottleneck": "2 sentences. Name the ONE specific friction point clearly. Mention exactly where on the page it is.",
  "sec3_impact": "2 sentences. Explain what this costs them in plain terms.",
  "sec4_fixes": [
    "Actionable, specific, free-to-implement fix 1",
    "Actionable, specific, free-to-implement fix 2",
    "Actionable, specific, free-to-implement fix 3"
  ],
  "sec5_pitch": "2 sentences max. Tell them exactly what you'll do and what outcome they can expect. Include a timeframe and the price (${price})."
}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" } // Forces strict JSON
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0]) throw new Error("AI returned an empty response.");

    const parsedJson = JSON.parse(data.choices[0].message.content);

    res.status(200).json(parsedJson);

  } catch (error) {
    console.error("GROQ API ERROR:", error);
    res.status(500).json({ error: "Lancify Engine Error: " + error.message });
  }
}
