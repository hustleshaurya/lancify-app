export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { emailType, tone, context, niche } = req.body;
  const groqApiKey = process.env.GROQ_API_KEY;

  const modelName = "llama-3.3-70b-versatile";

  const systemPrompt = `You are a top freelancer writing a cold outreach or follow-up email. The recipient is busy, slightly skeptical, and has seen 100 generic "I'd love to work with you" emails this week. Your email needs to feel like it was written specifically for them in the last 10 minutes - not templated, not AI.

Email type: """${emailType}"""
Tone: """${tone}"""
Context: """${context}"""
Niche: """${niche}"""

INTERNAL ANALYSIS - DO NOT OUTPUT:
1. What specific pain does this person have RIGHT NOW based on the context?
2. What is the ONE outcome they actually care about (not features - outcome)?
3. What is the lowest-friction ask you can make?

WRITE THE EMAIL:

3-PART STRUCTURE (mandatory):
1. Specific reference - name something real from their context that proves you actually looked.
2. One-line value drop - the outcome they get, not what you do. Frame as loss-avoidance if possible.
3. Single soft question - lowest friction ask. Not "let me know if you're interested". A real question.

RULES:
- Max 4 sentences total. Readable on a phone lock screen.
- Subject line: 3-5 words, lowercase, sounds like it's from a friend not a marketer.
- No "I hope this finds you well", "just following up", "checking in", "circling back".
- No bullet points. Plain prose only.
- Every word must earn its place. If removing it doesn't change meaning -> remove it.
- The email must feel like it was written at 11pm by someone who genuinely noticed something about the recipient.

OUTPUT (strict JSON, no markdown):
{
  "subject": "3-5 word lowercase subject",
  "body": "the email. use \\n\\n for paragraph breaks. max 4 sentences.",
  "tips": [
    "why this subject line gets opened instead of ignored",
    "the psychological reason the CTA gets a reply"
  ],
  "alternativeSubject": "one alternative subject line with a different angle"
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
      subject: parsedJson.subject,
      body: parsedJson.body,
      tips: parsedJson.tips,
      alternativeSubject: parsedJson.alternativeSubject || null,
    });

  } catch (error) {
    console.error("GROQ API ERROR:", error);
    res.status(500).json({ error: "Failed to write email: " + error.message });
  }
}
