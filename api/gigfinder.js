export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { skills, platform } = req.body;

  if (!skills) return res.status(400).json({ error: 'Skills are required' });

  const prompt = `You are an expert freelance strategist and market researcher for Indian students.
  
  Student Skills: "${skills}"
  Target Platform: "${platform}"

  Based on current freelance market trends, recommend the top 3 highly profitable and specific freelance niches this student should pursue. Do not be generic (e.g., don't just say "Graphic Design", say "YouTube Thumbnail Design for Finance Creators").

  For each niche, provide:
  - title: The exact gig title to use
  - demand: "High", "Medium", or "Low"
  - competition: "High", "Medium", or "Low"
  - priceRange: Average price range in INR (e.g., "₹2,000 - ₹5,000")
  - whyNow: A 1-sentence reason why this is a great niche right now.

  Return ONLY a valid JSON object in this exact format, with no markdown formatting:
  {
    "niches": [
      {
        "title": "...",
        "demand": "...",
        "competition": "...",
        "priceRange": "...",
        "whyNow": "..."
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
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to find gigs' });
  }
}
