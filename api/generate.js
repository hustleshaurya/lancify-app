export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers so your HTML page can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { answers } = req.body;

  if (!answers) {
    return res.status(400).json({ error: 'No answers provided' });
  }

  const prompt = `You are Lancify AI — a world-class freelance coach for Indian students aged 18–25.

A student has answered 5 onboarding questions. Read their answers VERY carefully and generate a 100% personalised kit based on exactly what they said.

Their answers:
- Skills & tools they use: "${answers.skills}"
- Past experience (even unpaid): "${answers.experience}"
- Hours available per day: "${answers.hours}"
- Income goal for first month: "${answers.goal}"
- Preferred platform: "${answers.platform}"

CRITICAL RULES — you MUST follow these:
1. Base the niche STRICTLY on their actual skills. If they say coding/programming/Python/JavaScript/HTML/CSS/React/Node/Next → assign a tech/development niche like "Web Development", "Landing Page Development", "WordPress Development", "Python Automation Scripts", "React App Development", etc. NEVER assign design or writing to a coder.
2. If they say Canva/design/Photoshop/Illustrator/Figma → assign a design niche.
3. If they say writing/content/blogs/copywriting → assign a writing niche.
4. If they say video editing/CapCut/Premiere/After Effects → assign a video editing niche.
5. If they say Excel/data/spreadsheets/analytics → assign a data/Excel niche.
6. If they say social media/Instagram/reels/content creation → assign a social media management niche.
7. Match the gig title and description to their actual niche — NEVER use a generic template.
8. The 7-day action plan must include platform-specific steps for ${answers.platform}.
9. Pricing must be realistic for Indian beginners in THEIR specific niche.
10. Developer niches pay significantly more than design or writing niches — reflect this in pricing.

Respond with ONLY a valid JSON object. No markdown, no backticks, no preamble, no explanation. Exactly this structure:

{
  "niche": "Precise niche title matching their actual skill",
  "niche_reason": "2 specific sentences explaining why THIS niche matches THEIR stated skills and will earn well on their chosen platform.",
  "portfolio_blurb": "3-sentence first-person bio written specifically for their niche. Mention their actual skill. Sound confident and professional.",
  "pricing": {
    "basic": { "name": "Starter", "price": "₹X,XXX", "deliverables": "item1\\nitem2\\nitem3", "timeline": "X days" },
    "standard": { "name": "Standard", "price": "₹X,XXX", "deliverables": "item1\\nitem2\\nitem3\\nitem4", "timeline": "X days" },
    "premium": { "name": "Premium", "price": "₹X,XXX", "deliverables": "item1\\nitem2\\nitem3\\nitem4\\nitem5", "timeline": "X days" }
  },
  "gig_title": "SEO-optimized gig title under 80 chars — MUST match their actual skill",
  "gig_description": "150-word gig description with relevant emojis. Must mention their actual skill. Professional but warm.",
  "pitch_script": "100-word cold DM pitch specific to their niche. Human and natural tone. Ends with a soft call to action.",
  "action_plan": "Day 1: [specific task]\\nDay 2: [specific task]\\nDay 3: [specific task]\\nDay 4: [specific task]\\nDay 5: [specific task]\\nDay 6: [specific task]\\nDay 7: [specific task]"
}

Pricing benchmarks for Indian freelance beginners:
- Web/App Development: Basic ₹3,000–₹5,000 | Standard ₹7,000–₹12,000 | Premium ₹15,000–₹25,000
- Graphic/UI Design: Basic ₹1,500–₹2,500 | Standard ₹3,500–₹6,000 | Premium ₹7,000–₹12,000
- Content Writing: Basic ₹800–₹1,500 | Standard ₹2,000–₹4,000 | Premium ₹5,000–₹8,000
- Video Editing: Basic ₹1,500–₹2,500 | Standard ₹3,500–₹5,000 | Premium ₹6,000–₹10,000
- Social Media: Basic ₹2,000–₹3,000 | Standard ₹4,000–₹6,000 | Premium ₹8,000–₹12,000
- Data/Excel: Basic ₹1,000–₹2,000 | Standard ₹3,000–₹5,000 | Premium ₹6,000–₹10,000`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2000 }
        })
      }
    );

    const data = await geminiRes.json();

    if (data.error) {
      console.error('Gemini error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/```json|```/g, '').trim();
    const kit = JSON.parse(raw);
    return res.status(200).json(kit);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message });
  }
}
