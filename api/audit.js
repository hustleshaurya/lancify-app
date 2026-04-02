export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { target, platform, weakness, service, price, observation } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // We are using Gemini 2.5 Flash - the current industry standard for speed/reliability
  const modelName = "gemini-2.5-flash"; 

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
    // Switching to the v1 stable endpoint for maximum reliability
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt)
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    if (!data.candidates || !data.candidates[0]) {
      throw new Error("AI returned an empty response. Check your API quota.");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: "Lancify Engine Error: " + error.message });
  }
}
