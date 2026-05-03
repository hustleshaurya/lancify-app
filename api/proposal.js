export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobDesc, platform, experience, niche } = req.body;
  const groqApiKey = process.env.GROQ_API_KEY;
  const modelName = "llama-3.3-70b-versatile";

  const systemPrompt = `You are writing a freelance proposal that will be read by a busy decision-maker who gets 40+ applications per day. Your ONLY goal: make them stop scrolling and reply.

INTERNAL ANALYSIS - DO NOT OUTPUT THIS:
Step 1: Find the ONE sentence in the job description that reveals what they actually fear (missed deadline, wasted money, looking bad to their boss, previous freelancer failed them).
Step 2: Find ONE detail in the job description that 95% of applicants will miss or ignore.
Step 3: Build your entire proposal around those two things.

THE PROPOSAL MUST PASS THESE 3 TESTS BEFORE FINALIZING:
TEST 1 - THE SCAN TEST: If someone reads only the first line, do they immediately feel "this person gets it"? If no -> rewrite the first line.
TEST 2 - THE AI TEST: Read it out loud. If any sentence sounds like it was written by AI or a template -> rewrite that sentence until it sounds like a human texted it.
TEST 3 - THE REPLY TEST: Would a busy founder, creator, or business owner stop what they're doing and reply? If no -> find what's weak and fix it.

STRICT RULES:
- Word count: 55-85 words. Count them. If over 85 -> cut.
- NO greetings (no Hi, Hello, Dear).
- NO banned phrases: "I am interested", "I can help you", "I specialize in", "passionate about", "seamless", "innovative", "leverage", "game-changer", "value-driven", "I understand your requirements", "perfect fit", "proven track record".
- First sentence MUST reference something specific from the job post - not generic, not "I saw your post".
- Include exactly ONE micro-insight - something only someone who's done this work would notice.
- End with ONE soft curiosity question tied to their specific situation.
- Tone: calm, slightly detached, confident - like you have 3 other clients and don't desperately need this one.
- Every proposal must feel structurally different from the last. Vary the hook type, insight placement, and CTA style.

Experience context to weave in naturally (don't just paste it): """${experience || 'my standard process'}"""

OUTPUT FORMAT (STRICT JSON, no markdown, no backticks):
{
  "output": {
    "subject": "4-6 word curiosity subject line, lowercase",
    "proposal": "60-90 word proposal text",
    "tips": [
      "psychology reason why the first line stops the scroll",
      "what the micro-insight signals about your expertise",
      "why the CTA gets a reply instead of being ignored"
    ],
    "redFlag": "ONE honest warning about this job post the freelancer should know before applying — e.g. 'No budget mentioned and they want ongoing work — qualify the budget before investing time.' Return null if no red flags."
  }
}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Job Description: """${jobDesc}"""\nPlatform: ${platform || 'not specified'}\nNiche: ${niche || 'not specified'}` }
        ],
        temperature: 0.68,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);

    const parsedJson = JSON.parse(data.choices[0].message.content);

    res.status(200).json({
      subject: parsedJson.output.subject,
      proposal: parsedJson.output.proposal,
      tips: parsedJson.output.tips,
      redFlag: parsedJson.output.redFlag || null
    });

  } catch (error) {
    console.error("GROQ API ERROR:", error);
    res.status(500).json({ error: "Failed to write proposal: " + error.message });
  }
}
