export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { emailType, tone, context, niche } = req.body; 
  const groqApiKey = process.env.GROQ_API_KEY; 

  const modelName = "llama-3.3-70b-versatile";

  const systemPrompt = `You are a top 1% freelance consultant (${niche}) writing an email. 
Your ONLY goal is to get a reply. 

Email Objective: """${emailType}"""
Tone: """${tone}"""
Context/Details: """${context}"""

PHASE 1: INTERNAL ANALYSIS (DO NOT SKIP)
1. Problem: What is the core problem or context they are facing?
2. Value: What is the specific outcome, missed revenue, or micro-insight related to this?
3. Nudge: What is the lowest-friction question to ask?

PHASE 2: EMAIL WRITING
Write the email using the analysis.

STRICT RULES:
1. HUMAN FILTER: Before finalizing, ask: "Does this sound like AI or a generic marketer?" If YES → rewrite to sound like a 1-to-1 plain text email from a busy professional.
2. THE FOLLOW-UP FRAMEWORK (CRITICAL): Every email MUST follow this exact 3-step flow:
   - Remind Problem: Briefly state the specific issue or context (e.g., "Sent the Shopify proposal to fix the mobile drop-off.").
   - Reinforce Value: Drop a 1-sentence reminder of why fixing this matters or a micro-insight (e.g., "Those lost mobile sales add up fast, so I want to get that leak plugged.").
   - Nudge Softly: End with a single, low-pressure question (e.g., "Still open to fixing this?").
3. NO GENERIC OPENERS: Ban "I hope this finds you well", "Just checking in", "Following up", or "Did you get my email".
4. BREVITY: Maximum 3-4 short sentences. Make it readable on an iPhone lock screen.

OUTPUT FORMAT (STRICT JSON):
{
  "analysis": {
    "problem": "string",
    "value": "string",
    "nudge": "string"
  },
  "output": {
    "subject": "3-5 word subject line (lowercase feels more human)",
    "body": "The actual email text. Use \\n\\n for paragraph breaks.",
    "tips": [
      "Why this subject works",
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
