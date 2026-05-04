export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skills, platform, experience, budget } = req.body;

  if (!skills) return res.status(400).json({ error: 'Skills are required' });
  if (skills.trim().length < 3) return res.status(400).json({ error: 'Please describe your skills in more detail' });

  const systemPrompt = `You are a freelance market analyst who tracks platform demand weekly. You help beginners find niches where they can win their first client within 14 days, not someday.

Platform being analyzed: ${platform}
Freelancer's skill set: "${skills}"
Experience: ${experience || 'Complete beginner, no reviews'}
Income goal: ${budget || '$1,000-$2,500/month'}

YOUR INTERNAL ANALYSIS (do not output):
Step 1: What can this freelancer actually deliver in their first week with zero reviews?
Step 2: On ${platform} right now — what specific job titles are being posted repeatedly that match these skills?
Step 3: Which of those have fewer than 50 sellers with under 10 reviews competing? That's the opening.
Step 4: What is the EXACT gig title format clients search for? Not a category — a specific title like "Shopify product page copywriting for beauty brands" not "ecommerce copywriting"
Step 5: What would a portfolio piece look like for this niche that takes under 3 hours to make?

STRICT QUALITY RULES:
- NEVER recommend niches like "Social Media Management", "Graphic Design", "Content Writing", "Video Editing" as standalone — these are categories not niches
- Every title must be hyper-specific — include the WHO, WHAT, and FOR WHOM: "YouTube thumbnail design for finance creators under 50k subscribers"
- priceRange must be what a BEGINNER with zero reviews can realistically charge in week 1 — not aspirational numbers
- whyNow must name a SPECIFIC platform shift, tool release, industry trend, or audience behavior happening right now in 2025-2026 — not generic "growing demand"
- firstStep must be so specific that the freelancer knows exactly what to open, type, or create in the next 60 minutes — name the tool, the search term, or the exact action
- portfolioHook must describe a free sample or mock project they can build in under 3 hours that proves they can do the work — specific enough to actually make
- winCondition is the exact type of client on ${platform} who would hire this person within 14 days — describe them in one sentence like a profile`;

  const userPrompt = `Give me the top 5 specific, winnable niches for this freelancer on ${platform}.

Each niche must have:
- title: Exact gig title a client would search (specific, include who it's for)
- demand: "High" / "Medium" / "Low" based on actual ${platform} job posting volume
- competition: "High" / "Medium" / "Low" based on number of established sellers
- entryBarrier: "Easy" / "Medium" / "Hard" for a beginner with zero reviews
- priceRange: What a beginner charges in week 1 (realistic, not aspirational)
- whyNow: 1 sentence naming a SPECIFIC trend or platform shift in 2025-2026 driving demand
- firstStep: Exact action to take in the next 60 minutes — name the tool, search term, or thing to create
- portfolioHook: A free sample or mock project they can build in under 3 hours to prove the skill
- winCondition: The exact type of client on ${platform} most likely to hire a beginner in this niche within 14 days

Return ONLY valid JSON, no markdown, no backticks:
{
  "niches": [
    {
      "title": "...",
      "demand": "...",
      "competition": "...",
      "entryBarrier": "...",
      "priceRange": "...",
      "whyNow": "...",
      "firstStep": "...",
      "portfolioHook": "...",
      "winCondition": "..."
    }
  ],
  "topPick": "The single best niche from the 5 for THIS specific freelancer to start with — just the title",
  "avoid": "One niche that looks attractive but is a trap for beginners right now — just the title and one sentence why"
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
        temperature: 0.65,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0]) throw new Error('Model returned empty response');

    const result = JSON.parse(data.choices[0].message.content);

    res.status(200).json(result);
  } catch (error) {
    console.error('GIG FINDER ERROR:', error);
    res.status(500).json({ error: 'Failed to find gigs: ' + error.message });
  }
}
