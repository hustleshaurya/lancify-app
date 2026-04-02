import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { target, platform, weakness, service, price, observation } = req.body;

  const prompt = `
    You are a world-class business growth consultant. Write a "Trojan Horse" audit for:
    CLIENT: ${target}
    PLATFORM: ${platform}
    WEAKNESS: ${weakness}
    FREELANCE SERVICE: ${service}
    PRICE: ${price}
    OBSERVATION: ${observation}

    RULES:
    - Use "Clinical" and "Professional" language. 
    - Use Indian Rupees (₹).
    - Avoid AI clichés.

    RETURN ONLY A JSON OBJECT:
    {
      "email_script": "3-sentence cold email.",
      "sec1_assessment": "Brand strength + gap.",
      "sec2_bottleneck": "Why ${weakness} kills growth.",
      "sec3_impact": "Estimated money lost (10-15%).",
      "sec4_fixes": ["Fix 1", "Fix 2"],
      "sec5_pitch": "How ${service} fixes this for ${price}."
    }
  `;

  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.status(200).json(JSON.parse(text));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate audit' });
  }
}
