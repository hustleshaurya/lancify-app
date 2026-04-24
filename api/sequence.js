export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { leadName, platform, problem, niche, offer } = req.body;
  const GROQ = process.env.GROQ_API_KEY;

  if (!leadName || !problem || !niche) {
    return res.status(400).json({ error: 'Lead name, problem, and niche are required.' });
  }

  const systemPrompt = `You are a world-class freelance outreach strategist. You write outreach sequences that get replies — not generic templates.

You are writing a 3-touch outreach sequence for a freelancer targeting a specific lead.

Lead: ${leadName}
Platform: ${platform || 'general'}
Their core problem: ${problem}
Freelancer niche: ${niche}
Offer/price: ${offer || 'flexible'}

SEQUENCE RULES:
- Each message must feel like it was written by a real human, not a tool
- No greetings like "Hi I hope this finds you well"
- No "I am interested in working with you"
- No "I specialize in" or "I am passionate about"
- Each message must be shorter than the previous one
- Day 0: Hook + one specific insight + soft CTA. Max 60 words.
- Day 3: Reference the first message implicitly. Add one NEW micro-insight they didn't know. End with one question. Max 40 words.
- Day 7: Ultra-short. 2-3 sentences max. Low pressure. Leave the door open without being desperate.
- Every message must reference something SPECIFIC about ${leadName} — never generic
- The CTA must always be a question, never a statement
- Tone across all 3: calm, confident, slightly detached — like you have other clients

HUMAN FILTER: Before finalizing each message, ask "does this sound like AI wrote it?" If yes, rewrite it.

Return ONLY valid JSON:
{
  "day0": {
    "type": "Cold DM or Cold Email",
    "subject": "subject line if email, null if DM",
    "message": "the actual message"
  },
  "day3": {
    "type": "Follow-up",
    "subject": "Re: [day0 subject] or null",
    "message": "the actual message"
  },
  "day7": {
    "type": "Final Nudge",
    "subject": "subject if email or null",
    "message": "the actual message"
  },
  "strategy": "2 sentence explanation of why this sequence works for this specific lead"
}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.72,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const result = JSON.parse(data.choices[0].message.content);
    return res.status(200).json(result);
  } catch (error) {
    console.error('SEQUENCE API ERROR:', error);
    return res.status(500).json({ error: 'Failed to generate sequence: ' + error.message });
  }
}
