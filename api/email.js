export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { emailType, tone, context, niche } = req.body;
  const groqApiKey = process.env.GROQ_API_KEY;

  const modelName = "llama-3.3-70b-versatile";

  const systemPrompt = `You are writing a cold outreach or follow-up message for a freelancer. The recipient is a busy person who gets 50+ generic messages a week. Your message needs to feel like it came from someone who spent 5 minutes actually looking at their situation — not someone blasting a template.

Email type: """${emailType}"""
Tone: """${tone}"""
Context: """${context}"""
Niche: """${niche}"""

INTERNAL ANALYSIS — DO NOT OUTPUT:
1. What is the ONE specific thing from the context that reveals their pain right now?
2. What is the outcome they want — not the feature you offer, the actual result?
3. What is the single lowest-friction question you can end with?

WRITE THE MESSAGE:

MANDATORY 3-PART STRUCTURE:
Part 1 — STATEMENT (not an observation): Open with a direct statement about their situation. Not "I noticed X" — instead write the observation AS a fact: "Your daily workouts are landing but there's no way for followers to book you." State it, don't narrate it.
Part 2 — ONE-LINE OUTCOME: What they gain or stop losing. Frame as loss-avoidance: "That's [X amount] in bookings sitting uncaptured every week."
Part 3 — ONE SOFT QUESTION: The single lowest-friction ask. Must be answerable in 5 words. Never "let me know if you're interested." Never two questions.

HARD RULES — VIOLATIONS MEAN REWRITE:
- NEVER open with "I noticed", "I saw", "I came across", "I wanted to reach out"
- NEVER use recipient's name in the subject line — sounds like spam
- NEVER ask two questions — ONE question maximum, at the very end
- NEVER say "Are you aware", "I'd love to", "I can help you", "just checking in"
- NEVER be preachy or explain what they're doing wrong for more than one sentence
- Max 4 sentences total in the body. If it's longer → cut.
- Subject line: 3-5 words, all lowercase, no name, sounds like a message from a colleague not a marketer
- Every sentence must feel like it could only have been written for this specific person

TONE: Calm. Direct. Slightly detached. Like someone who has other clients and genuinely noticed one thing worth mentioning.

OUTPUT (strict JSON, no markdown):
{
  "subject": "3-5 word lowercase subject, no recipient name",
  "body": "the message. max 4 sentences. use \\n\\n for paragraph breaks.",
  "tips": [
    "why this subject gets opened instead of deleted",
    "the psychological reason the single CTA gets a reply"
  ],
  "alternativeSubject": "different angle subject line, also lowercase, also no name"
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
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write the email now based on the context provided. Context: """${context}""" Email type: ${emailType}. Tone: ${tone}. Niche: ${niche}.` }
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
