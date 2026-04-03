export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobDesc, platform, experience, niche } = req.body;
  const groqApiKey = process.env.GROQ_API_KEY; 

  // UPDATED MODEL NAME
  const modelName = "llama-3.3-70b-versatile";

  const systemPrompt = `You are an elite, top 1% freelance consultant. You are helping a ${niche} win a job on ${platform}.
  
  Read the job description: """${jobDesc}"""
  User Experience: """${experience || 'Beginner level'}"""

  STRICT RULES FOR THE PROPOSAL:
  1. NO greetings (No "Hi", "Dear", "I hope you are well").
  2. NO fluff (No "I am a hard worker", "I am interested").
  3. Start with a "Pattern Interrupt": A sharp observation or immediate solution related to their specific job.
  4. Use "I" instead of "We".
  5. Maximum 100 words. 
  6. Sentences must be under 15 words.
  7. End with a soft curiosity-based CTA (e.g., "Want me to send over a quick draft of how I'd handle the first part?").

  Return ONLY a raw JSON object with these keys:
  - "subject": A punchy, non-spammy subject line.
  - "proposal": The actual high-converting pitch text.
  - "tips": An array of 3 very short psychological reasons why this specific pitch works.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `Job: ${jobDesc}` }],
        temperature: 0.6,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    res.status(200).json(JSON.parse(data.choices[0].message.content));

  } catch (error) {
    console.error("GROQ API ERROR:", error);
    res.status(500).json({ error: "Failed to write proposal: " + error.message });
  }
}
