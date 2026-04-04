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

  const systemPrompt = `You are a no-nonsense freelance coach who has helped hundreds of Indian students land their first paid client.

You speak directly, practically, and specifically. You never give vague advice like "build your portfolio" without saying exactly HOW and WHERE.

You know these tools exist inside Lancify and you mention them naturally where they fit — never forced, never salesy:
- Gig Finder: helps the student discover which niche to pursue
- Proposal Writer: helps write winning pitches for job posts
- Audit Tool: generates a cold outreach audit + email for potential clients

Your job is to build a personalized 30-day roadmap that takes ${name || 'this student'} from zero to their first paid rupee on ${platform}.

MINDSET:
- Every day must have ONE clear, completable task. Not a list of 5 things.
- Days should build on each other. Day 5 should feel connected to Day 4.
- Week 1 is setup. Week 2 is learning. Week 3 is outreach. Week 4 is closing.
- Be realistic about ${hoursPerDay || 2} hours per day availability.
- Address the student's biggest fear (${biggestFear || 'not knowing where to start'}) somewhere in the early days naturally.
- Mention Lancify tools only when genuinely useful — not every day.`;

  const userPrompt = `Build a 30-day freelance roadmap for:

Name: ${name || 'the student'}
Skills: ${skills}
Target Platform: ${platform}
Hours available per day: ${hoursPerDay || 2} hours
Current level: ${currentLevel || 'Complete beginner, no clients, no reviews'}
Biggest fear: ${biggestFear || 'Not knowing where to start'}
Goal: Land first paying client and earn first rupee within 30 days

Structure the roadmap as 4 weeks. Each week has a theme and daily tasks.

Return ONLY a valid JSON object, no markdown, no backticks:

{
  "studentName": "string",
  "goal": "one sentence personalized goal for this student",
  "platform": "string",
  "weeks": [
    {
      "weekNumber": 1,
      "theme": "short theme title e.g. 'Foundation & Setup'",
      "focus": "1 sentence explaining what this week is about",
      "days": [
        {
          "day": 1,
          "title": "short task title",
          "task": "The exact thing to do today. Be specific — name the website, the tool, the search term, the action. Under 40 words.",
          "why": "1 sentence explaining why this specific task matters right now",
          "lancifyTip": "optional — only include if a Lancify tool genuinely helps today. If not relevant, return null.",
          "timeEstimate": "e.g. '45 mins'"
        }
      ]
    }
  ],
  "finalMessage": "A 2 sentence motivational but grounded closing message for ${name || 'the student'} — no cringe, no hype. Just real talk."
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
        max_tokens: 4000,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0]) throw new Error("Model returned empty response");

    const result = JSON.parse(data.choices[0].message.content);

    res.status(200).json(result);

  } catch (error) {
    console.error("ROADMAP ERROR:", error);
    res.status(500).json({ error: 'Failed to generate roadmap: ' + error.message });
  }
}
