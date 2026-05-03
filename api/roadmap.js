export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    name,
    skills,
    platform,
    hoursPerDay,
    currentLevel,
    biggestFear
  } = req.body;

  if (!skills || !platform) {
    return res.status(400).json({ error: 'Skills and platform are required' });
  }

  const systemPrompt = `You are a brutally honest freelance mentor who has helped broke beginners land their first $1,000 client. You don't sugarcoat. You don't give motivational fluff. You give exact, actionable steps that actually work in the real world.

You know Lancify inside out. It has these features:
- Find Clients (Opportunity Engine): searches YouTube, Google, Instagram for real clients who need a specific skill. The user goes to "Find Clients", picks their skill, and gets leads with pitch angles.
- Proposal Writer: pastes a job post, gets a human-sounding proposal back in seconds.
- Email Writer: writes cold outreach emails and follow-ups with psychological hooks.
- Roadmap (this tool): the 30-day plan they're currently looking at.

RULES FOR EVERY SINGLE DAY:
1. ONE task. Not a list. One thing. Clear enough that a 16-year-old with no experience can do it.
2. Name the exact platform, search term, tool, or website. "Go to YouTube, search '[niche] + tips', filter by 1-10k subscribers" not "find creators online".
3. Where Lancify makes something 10x faster, say exactly: "Open Lancify -> Find Clients -> select [skill] -> copy the pitch angle from the first result".
4. The effort must match the hours selected. ${hoursPerDay} hrs/day is real - don't pack 6 hours of work into a 1-hour day.
5. Address ${biggestFear || 'fear of starting'} on Day 2 or 3. Not generic advice - specific action that kills the fear.
6. Week 1: setup + research (no outreach yet - they need ammo first).
7. Week 2: build proof + first 3 outreaches (small, low-pressure).
8. Week 3: daily outreach machine - 5+ outreaches per day using Lancify.
9. Week 4: follow-ups, closing, first invoice. Make it feel inevitable.
10. By Day 30, the plan must have put them in a position where landing a client is a matter of when, not if.

LANCIFY INTEGRATION RULES:
- Mention Lancify tools on approximately Days 5, 8, 12, 15, 18, 21, 24, 27. Not every day - only when it genuinely replaces 30+ minutes of manual work.
- When mentioning a tool, give the exact nav path: "Open Lancify -> [section] -> [action]".
- Never mention Lancify in a salesy way. Frame it as: "instead of spending 2 hours hunting manually, do this in Lancify instead:".

TONE: Like a mentor texting you at midnight saying "bro here's exactly what to do tomorrow". Real. Direct. No corporate speak.`;

  const userPrompt = `Build a 30-day freelance roadmap for:

Name: ${name || 'the freelancer'}
Skill: ${skills}
Platform: ${platform}
Hours per day: ${hoursPerDay || 2}
Level: ${currentLevel || 'complete beginner'}
Biggest fear: ${biggestFear || 'not knowing where to start'}
Goal: First paying client + first $1,000 within 30 days

Return ONLY valid JSON, no markdown, no backticks:

{
  "studentName": "string",
  "goal": "one brutally specific sentence - include the skill, platform, and dollar amount",
  "platform": "string",
  "weeks": [
    {
      "weekNumber": 1,
      "theme": "short theme e.g. 'Foundation & Ammo'",
      "focus": "1 sentence - what changes by end of this week",
      "days": [
        {
          "day": 1,
          "title": "short action-oriented title",
          "task": "Exact thing to do. Name the platform, search term, or Lancify path. Under 45 words. No vague advice.",
          "why": "1 sentence - the real-world reason this matters RIGHT NOW",
          "lancifyTip": "null OR exact Lancify instruction like: Open Lancify -> Find Clients -> select [skill] -> use the pitch angle from result #1 to write your first DM",
          "timeEstimate": "realistic estimate matching ${hoursPerDay} hrs/day"
        }
      ]
    }
  ],
  "finalMessage": "2 sentences. Real talk. No hype. Tell them the one thing that separates people who make it from people who quit."
}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 5000,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0]) throw new Error('Model returned empty response');

    const result = JSON.parse(data.choices[0].message.content);

    const totalDays = (result.weeks || []).reduce((sum, week) => sum + (week.days || []).length, 0);
    if (totalDays < 25) {
      console.warn(`[Roadmap] Incomplete plan - only ${totalDays} days generated`);
      return res.status(500).json({
        error: 'Roadmap generation was incomplete. Please try again.'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('ROADMAP ERROR:', error);
    res.status(500).json({ error: 'Failed to generate roadmap: ' + error.message });
  }
}
