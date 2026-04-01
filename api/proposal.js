export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { jobDesc, platform, experience, niche } = req.body;

  if (!jobDesc) return res.status(400).json({ error: 'Job description is required' });

  const prompt = `You are an expert freelance proposal writer for Indian students.
  
  Job description: "${jobDesc}"
  Platform: "${platform}"
  Student experience: "${experience || 'None specified'}"
  Student niche: "${niche || 'Freelancer'}"

  Write a winning proposal that:
  - Opens with the client's specific problem (not "Dear Sir")
  - Shows relevant experience in 2 sentences
  - Gives one specific insight about how to solve their problem
  - Clear deliverables and timeline
  - Confident closing with CTA
  - 150-200 words max
  - Sounds human, not AI-generated

  Return ONLY a valid JSON object in this exact format, with no markdown formatting or extra text:
  {"subject":"...","proposal":"...","tips":["tip1","tip2","tip3"]}`;

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
    res.status(500).json({ error: 'Failed to generate proposal' });
  }
}
