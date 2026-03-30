const https = require('https');

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY not set');
    return res.status(500).json({ error: 'API key not configured' });
  }

  const answers = req.body?.answers;
  if (!answers) return res.status(400).json({ error: 'No answers provided' });

  const prompt = `You are Lancify AI, a freelance coach for Indian students aged 18-25.

Student profile:
Skills: "${answers.skills}"
Experience: "${answers.experience}"
Hours per day: "${answers.hours}"
Income goal: "${answers.goal}"
Platform: "${answers.platform}"

Rules for niche assignment:
- coding/JavaScript/Python/HTML/CSS/React/Node -> WEB DEVELOPMENT
- Canva/design/Photoshop/Figma -> GRAPHIC DESIGN
- writing/content/blogs/copywriting -> CONTENT WRITING
- video/editing/CapCut/Premiere/YouTube -> VIDEO EDITING
- Excel/data/spreadsheets/analytics -> DATA ENTRY
- social media/Instagram/reels/marketing -> SOCIAL MEDIA MANAGEMENT

CRITICAL: Return ONLY valid JSON. No markdown. No backticks. No newlines inside string values. Use spaces instead of newlines inside strings.

Return exactly this structure:
{"niche":"NICHE NAME","niche_reason":"Reason sentence one. Reason sentence two.","portfolio_blurb":"Bio sentence one. Bio sentence two. Bio sentence three.","pricing":{"basic":{"name":"Starter","price":"Rs 2,500","deliverables":"Item one. Item two. Item three.","timeline":"3 days"},"standard":{"name":"Standard","price":"Rs 5,000","deliverables":"Item one. Item two. Item three. Item four.","timeline":"5 days"},"premium":{"name":"Premium","price":"Rs 10,000","deliverables":"Item one. Item two. Item three. Item four. Item five.","timeline":"7 days"}},"gig_title":"Your gig title here under 80 characters","gig_description":"Your 150 word gig description here without any line breaks just one paragraph","pitch_script":"Your 100 word cold DM script here without any line breaks just one paragraph","action_plan":{"day1":"Specific action for day 1","day2":"Specific action for day 2","day3":"Specific action for day 3","day4":"Specific action for day 4","day5":"Specific action for day 5","day6":"Specific action for day 6","day7":"Specific action for day 7"}}`;

  const payload = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: "You are a JSON API. You only output valid JSON objects. Never use newlines or control characters inside JSON string values. Never use markdown. Never add explanation text."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.7,
    max_tokens: 2048
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve({ status: r.statusCode, body: d }));
      });
      req2.on('error', reject);
      req2.write(payload);
      req2.end();
    });

    console.log('Groq HTTP status:', result.status);
    const data = JSON.parse(result.body);

    if (result.status !== 200) {
      console.error('Groq error:', JSON.stringify(data?.error));
      return res.status(500).json({ error: data?.error?.message || 'Groq error ' + result.status });
    }

    let raw = data?.choices?.[0]?.message?.content || '';
    console.log('Raw response preview:', raw.substring(0, 200));

    // Clean the response thoroughly
    raw = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // Extract JSON object
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error('No JSON found in:', raw.substring(0, 300));
      return res.status(500).json({ error: 'AI returned unexpected format' });
    }

    let jsonStr = match[0];

    // Fix bad control characters — replace actual newlines inside strings with space
    jsonStr = jsonStr.replace(/[\n\r\t]/g, ' ');

    // Fix multiple spaces
    jsonStr = jsonStr.replace(/  +/g, ' ');

    const kit = JSON.parse(jsonStr);
    console.log('Success - niche:', kit.niche);
    return res.status(200).json(kit);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
