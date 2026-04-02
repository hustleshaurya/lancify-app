export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { target, platform, weakness, service, price, observation } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const prompt = {
    contents: [{
      parts: [{
        text: `You are a world-class business consultant. Write a professional 5-section growth audit in JSON format for ${target} on ${platform}.
        Weakness: ${weakness}. Service: ${service}. Price: ${price}. Observation: ${observation}.
        Return ONLY a JSON object with these keys: email_script, sec1_assessment, sec2_bottleneck, sec3_impact, sec4_fixes (array of 3 strings), sec5_pitch.`
      }]
    }]
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt)
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    // Extract the text and clean it
    let rawText = data.candidates[0].content.parts[0].text;
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: "Gemini connection failed: " + error.message });
  }
}
