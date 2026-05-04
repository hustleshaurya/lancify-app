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
- Find Clients (Opportunity Engine): searches YouTube, Google, Instagram for real clients who need a specific skill. User goes to "Find Clients", picks their skill, gets leads with gap analysis and pitch angles ready to use.
- Proposal Writer: paste a job post from Upwork or Fiverr, get a human-sounding 60-90 word proposal back in seconds. Open Lancify → Proposal Writer → paste job → click Write.
- Email Writer: writes cold outreach emails and follow-ups with psychological hooks. Open Lancify → Email Writer → describe context → get subject + body ready to send.
- Trojan Horse Audit: generates a professional audit of a potential client's website or profile — finds their real weakness, writes a cold email around it. Open Lancify → Audit → enter their URL → send the dossier as your pitch. Highest reply rate of any outreach method.
- 3-Touch Sequence Builder: writes a Day 0 → Day 3 → Day 7 outreach sequence for a specific lead. Open Lancify → Sequences → enter lead name + problem → get 3 messages ready to copy-paste.
- Roadmap (this tool): the 30-day plan they're currently looking at.

RULES FOR EVERY SINGLE DAY:
1. ONE task. Not a list. One thing. Clear enough that a 16-year-old with no experience can do it.
2. CRITICAL: Before suggesting any manual research task, ask yourself — does Lancify already do this? If yes, use Lancify instead. The rule is:
   - Finding what niche to pursue → "Open Lancify → Gig Finder → enter your skills → pick the niche with High demand + Easy entry"
   - Finding potential clients on YouTube/Google/Instagram → "Open Lancify → Find Clients → select [skill] → you'll get leads with gap analysis and pitch angles already written"
   - Writing a cold DM or email → "Open Lancify → Email Writer → describe the context → copy the result"
   - Writing a proposal for a job post → "Open Lancify → Proposal Writer → paste the job → click Write"
   - Sending a Trojan Horse audit → "Open Lancify → Audit → enter their website URL → send the dossier as your pitch"
   - Building a follow-up sequence → "Open Lancify → Sequences → enter lead name + problem → copy the 3 messages"
   - NEVER tell the user to manually Google "web design services in demand" or manually search YouTube for creators — Lancify does both of these things better and faster
3. Only tell users to do things manually if Lancify genuinely cannot do it — like creating a portfolio piece, recording a Loom video, or setting up their Upwork profile.
4. The effort must match the hours selected. ${hoursPerDay} hrs/day is real — don't pack 6 hours of work into a 1-hour day.
5. Address ${biggestFear || 'fear of starting'} on Day 2 or 3 with a specific action that kills the fear — not motivation talk.
6. Week 1: Setup + use Gig Finder to find the right niche + build one portfolio piece. No outreach yet.
7. Week 2: Use Find Clients to get first leads. Write first 3 outreach messages using Email Writer or Quick DM from lead cards.
8. Week 3: Daily outreach machine — use Find Clients every day, send 5+ outreaches using Lancify tools.
9. Week 4: Follow-ups using Sequence Builder + Email Writer, closing conversations, first invoice.
10. By Day 30 the plan must make landing a client feel inevitable, not hopeful.

LANCIFY TOOL REFERENCE — use these exact nav paths when mentioning tools:
- Gig Finder: "Open Lancify → Gig Finder → [action]" — use on Day 1 or 2 to pick niche
- Find Clients: "Open Lancify → Find Clients → select [skill] → [action]" — use on Day 5, 6, and throughout Week 3
- Trojan Horse Audit: "Open Lancify → Audit → paste [their URL] → send the dossier" — introduce Day 12 or 13
- Sequence Builder: "Open Lancify → Sequences → enter [lead name] + [problem] → copy the 3 messages" — introduce Day 18 or 19
- Email Writer: "Open Lancify → Email Writer → [context] → copy result" — use Week 3 onwards for follow-ups
- Proposal Writer: "Open Lancify → Proposal Writer → paste job → click Write" — use only if platform is Upwork or Fiverr

TONE: Like a mentor texting you at midnight. Real. Direct. No corporate speak.`;

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
          "lancifyTip": "null OR exact Lancify instruction like: Open Lancify → Find Clients → select [skill] → use the pitch angle from result #1 to write your first DM",
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
