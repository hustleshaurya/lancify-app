const https = require('https');

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set in environment');
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const answers = req.body?.answers;
  if (!answers) return res.status(400).json({ error: 'No answers provided' });

  const prompt = `You are Lancify AI, a freelance coach for Indian students aged 18-25.

Student answers:
Skills: "${answers.skills}"
Experience: "${answers.experience}"
Hours/day: "${answers.hours}"
Income goal: "${answers.goal}"
Platform: "${answers.platform}"

IMPORTANT RULES:
- If skills mention coding/JavaScript/Python/HTML/CSS/React/Node/programming -> assign WEB DEVELOPMENT niche
- If skills mention Canva/design/Photoshop/Figma -> assign DESIGN niche  
- If skills mention writing/content/blogs -> assign WRITING niche
- If skills mention video/editing/CapCut/Premiere -> assign VIDEO EDITING niche
- If skills mention Excel/data/spreadsheets -> assign DATA niche
- If skills mention social media/Instagram/reels -> assign SOCIAL MEDIA niche

Return ONLY a raw JSON object. No markdown. No backticks. No extra text. Just JSON.

{"niche":"niche name here","niche_reason":"2 sentences why this fits them","portfolio_blurb":"3 sentence first-person professional bio","pricing":{"basic":{"name":"Starter","price":"Rs X,XXX","deliverables":"deliverable 1\ndeliverable 2\ndeliverable 3","timeline":"3 days"},"standard":{"name":"Standard","price":"Rs X,XXX","deliverables":"deliverable 1\ndeliverable 2\ndeliverable 3\ndeliverable 4","timeline":"5 days"},"premium":{"name":"Premium","price":"Rs X,XXX","deliverables":"deliverable 1\ndeliverable 2\ndeliverable 3\ndeliverable 4\ndeliverable 5","timeline":"7 days"}},"gig_title":"SEO gig title under 80 chars","gig_description":"150 word description with emojis","pitch_script":"100 word cold DM","action_plan":"Day 1: action\nDay 2: action\nDay 3: action\nDay 4: action\nDay 5: action\nDay 6: action\nDay 7: action"}`;

  try {
    // ✅ FIXED: Updated to gemini-2.0-flash (1.5-flash is deprecated)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    });

    const result = await new Promise((resolve, reject) => {
      const url = new URL(geminiUrl);
      const req2 = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve({ status: r.statusCode, body: d }));
      });
      req2.on('error', reject);
      req2.write(payload);
      req2.end();
    });

    console.log('Gemini HTTP status:', result.status);
    const data = JSON.parse(result.body);

    if (result.status !== 200) {
      console.error('Gemini error:', JSON.stringify(data?.error));
      return res.status(500).json({ error: data?.error?.message || 'Gemini returned error ' + result.status });
    }

    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/```json/g,'').replace(/```/g,'').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error('No JSON in response:', raw.substring(0,300));
      return res.status(500).json({ error: 'AI returned unexpected format' });
    }

    const kit = JSON.parse(match[0]);
    console.log('Success - niche:', kit.niche);
    return res.status(200).json(kit);

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
