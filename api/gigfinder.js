export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skills, platform, experience, budget } = req.body;

  if (!skills) return res.status(400).json({ error: 'Skills are required' });

  const systemPrompt = `You are a sharp freelance market strategist who specializes in helping Indian students land their first ₹5,000–₹50,000/month on freelance platforms.

You have deep knowledge of:
- What clients are actively hiring for RIGHT NOW on ${platform}
- Which niches are oversaturated vs underserved
- What a beginner with no reviews can realistically win
- How to position a generic skill into a specific, high-converting niche

YOUR THINKING PROCESS (internal, do not output):
1. Look at the student's skills: what are they ACTUALLY good enough at to deliver results?
2. Cross-reference with current ${platform} demand: what are clients posting jobs for this month?
3. Find the intersection: high demand + low competition + beginner can deliver = winning niche
4. For each niche, think: what is the EXACT gig title a client would search for? Not a broad category.
5. Ask yourself: "Is this specific enough that a student could create a portfolio piece for it this week?" If not, go more specific.

STRICT RULES:
- Never recommend generic niches like "Graphic Design", "Content Writing", "Web Development"
- Every niche must be hyper-specific (e.g., "Notion Dashboard Setup for Coaches" not "Notion Templates")
- Price ranges must be realistic for Indian freelancers on ${platform} — not inflated fantasy numbers
- The "whyNow" must reference something real and current — a trend, a platform shift, a growing industry
- If skills are weak or vague, recommend niches that require LEARNING one small additional skill on top
- Beginner-friendliness matters — factor in that this student likely has no reviews yet`;

  const userPrompt = `Student Skills: "${skills}"
Target Platform: "${platform}"
Experience Level: "${experience || 'Beginner — no reviews yet'}"
Monthly Income Goal: "${budget || '₹10,000–₹25,000/month to start'}"

Based on this, recommend the top 5 highly specific, currently profitable freelance niches this student should pursue on ${platform}.

For each niche provide:
- title: Exact gig title to use (what a client would literally search for)
- demand: "High", "Medium", or "Low" — based on actual ${platform} job volume
- competition: "High", "Medium", or "Low" — how many sellers already offer this
- entryBarrier: "Easy", "Medium", or "Hard" — can a beginner start this week?
- priceRange: Realistic INR range per project for a beginner (e.g., "₹1,500 – ₹4,000")
- whyNow: 1 sentence. Must reference a current trend, platform growth, or industry shift — not generic advice
- firstStep: 1 sentence. The single most important thing the student should do TODAY to start in this niche

Return ONLY a valid JSON object. No markdown, no backticks, no explanation:
{
  "niches": [
    {
      "title": "...",
      "demand": "...",
      "competition": "...",
      "entryBarrier": "...",
      "priceRange": "...",
      "whyNow": "...",
      "firstStep": "..."
    }
  ]
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
        temperature: 0.65, // Lower than default — niche recommendations should be grounded, not creative
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0]) throw new Error("Model returned empty response");

    const result = JSON.parse(data.choices[0].message.content);

    res.status(200).json(result);

  } catch (error) {
    console.error("GIG FINDER ERROR:", error);
    res.status(500).json({ error: 'Failed to find gigs: ' + error.message });
  }
}
