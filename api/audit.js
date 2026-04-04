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
        // Increased from 3000 to 6000 to capture more meaningful page content
        scrapedContent = fullText.substring(0, 6000);
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

  const prompt = {
    contents: [{
      parts: [{
        text: `You are a sharp, experienced freelance digital consultant. You write audit reports and cold emails for potential clients.

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
10. Before finalizing the email specifically, ask yourself: "Would a real business owner actually reply to this?" If not, improve the clarity and specificity until the answer is yes.

---

Return ONLY a raw JSON object. No markdown, no backticks, no explanation. Use exactly these keys:

"email_subject":
"A lowercase, specific, curiosity-driven subject line. Never generic like 'quick question' or 'I can help'. Do not include the word 'Subject:'",

"email_body": 
"The cold email body. Rules:
- Opening: reference something real and specific from the site. NOT a generic compliment.
- Body: mention the ONE specific issue you found and why it matters to someone ready to take action right now.
- Keep it under 120 words total.
- Close with a direct, low-commitment ask. Not 'worth a quick look?' — something like 'Want me to send over a before/after?' or 'Open to a 10-minute call this week?'",

"sec1_assessment":
"2 sentences. Start with something specific you noticed that is actually good about the site. Sound like you actually looked at it, not like you're filling a template slot.",

"sec2_bottleneck":
"2 sentences. Name the ONE specific friction point clearly. Mention exactly where on the page it is. No vague language.",

"sec3_impact":
"2 sentences. Explain what this costs them in plain terms. Focus on high-intent users who were ready to act but got stuck. Use a realistic number range — do not always default to '5-10 inquiries.'",

"sec4_fixes":
[
  "Actionable, specific, free-to-implement fix 1",
  "Actionable, specific, free-to-implement fix 2",
  "Actionable, specific, free-to-implement fix 3"
],

"sec5_pitch":
"2 sentences max. Tell them exactly what you'll do and what outcome they can expect. Include a timeframe and the price (${price}). End with: 'Happy to show a quick before/after so you can see the difference.'"

---

Return only the JSON. Start with { and end with }.`
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

    // Clean any accidental markdown formatting
    const cleanJson = rawText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleanJson);

    res.status(200).json(parsed);

  } catch (error) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: "Lancify Engine Error: " + error.message });
  }
}
