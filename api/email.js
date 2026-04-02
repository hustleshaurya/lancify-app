export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { emailType, context, tone, niche } = req.body;

  if (!emailType || !context) return res.status(400).json({ error: 'Email type and context are required' });

  const prompt = `You are an expert freelance communicator and business coach for Indian students.
  
  Student Niche: "${niche || 'Freelancer'}"
  Email Purpose: "${emailType}"
  Context/Details: "${context}"
  Desired Tone: "${tone}"

  Write a professional client email based on the details above. It must:
  - Have a clear, clickable subject line
  - Match the requested tone exactly (e.g., firm for late payments, friendly for networking)
  - Be concise and highly readable (use short paragraphs)
  - Sound human, polite, and confident
  - Include placeholders like [Client Name] where appropriate

  Return ONLY a valid JSON object in this exact format, with no markdown formatting or extra text:
  {"subject":"...","body":"...","tips":["tip1","tip2","tip3"]}`;

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
    res.status(500).json({ error: 'Failed to generate email' });
  }
}
