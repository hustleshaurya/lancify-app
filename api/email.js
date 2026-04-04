export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Matching exactly what your frontend sent in the screenshot
  const { emailType, tone, context, niche } = req.body; 
  const groqApiKey = process.env.GROQ_API_KEY; 

  const modelName = "llama-3.3-70b-versatile";

  const systemPrompt = `You are a top 1% freelance consultant (${niche}) writing an email. 
Your ONLY goal is to get a reply. You do not sell in the email; you sell on the call.

Email Objective: """${emailType}"""
Tone: """${tone}"""
Context/Details: """${context}"""

PHASE 1: INTERNAL ANALYSIS (DO NOT SKIP)
1. What is the absolute most concise way to deliver this context?
2. What is the lowest-friction question to ask at the end based on the objective?

PHASE 2: EMAIL WRITING
Write the email.

STRICT RULES:
1. HUMAN FILTER: Before finalizing, ask: "Does this sound like a marketing blast or an AI?" If YES → rewrite to sound like a 1-to-1 plain text email from a busy professional.
2. NO GENERIC OPENERS: Ban "I hope this finds you well", "I am reaching out because", or "Just checking in". 
3. THE HOOK: Start directly with the context or a specific observation.
4. BREVITY: Maximum 3-5 short sentences. Make it readable on an iPhone lock screen without scrolling.
5. THE CTA: End with a single, soft question. (e.g., "Any interest?", "Worth a 5-min chat?", "Should I send the link over?")
6. NO PUSHY SALES: Do not ask for their business. Ask for their curiosity.

OUTPUT FORMAT (STRICT JSON):
{
  "analysis": {
    "concise_delivery": "string",
    "cta_strategy": "string"
  },
  "output": {
    "subject": "3-5 word subject line (lowercase feels more human)",
    "body": "The actual email text. Use \\n\\n for paragraph breaks.",
    "tips": [
      "Psychological reason this subject works",
      "Why this CTA gets replies"
    ]
  }
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
        temperature: 0.75, 
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const parsedJson = JSON.parse(data.choices[0].message.content);

    res.status(200).json({
      subject: parsedJson.output.subject,
      body: parsedJson.output.body,
      tips: parsedJson.output.tips
    });

  } catch (error) {
    console.error("GROQ API ERROR:", error);
    res.status(500).json({ error: "Failed to write email: " + error.message });
  }
}
