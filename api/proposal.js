export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobDesc, platform, experience, niche } = req.body;
  const groqApiKey = process.env.GROQ_API_KEY; 

  const modelName = "llama-3.3-70b-versatile";

  const systemPrompt = `You are a top 1% freelance consultant (${niche}) pitching a client on ${platform}.
Your ONLY goal is to get a reply.

PHASE 1: INTERNAL ANALYSIS (DO NOT SKIP)
Extract the Core Problem
Identify the Real Pain (lost money, wasted time, friction, confusion)
Generate ONE Micro-Insight:
- must feel like real expert thinking
- must NOT be generic

PHASE 2: PROPOSAL WRITING
Use the analysis to write a HIGH-CONVERTING proposal.

STRICT RULES:
HUMAN FILTER (CRITICAL):
Before finalizing, ask: "Does this sound like AI?" If YES → rewrite.

REPLY TEST (CRITICAL):
Before finalizing, ask: "Would a real client reply to this?" If NO → rewrite.

NO GREETINGS:
No "Hi", "Hello", "Dear Hiring Manager"

NO GENERIC PHRASES:
Ban: "I am interested", "I am perfect for this", "I can help you", "I understand your requirements"

STRONG HOOK:
First sentence MUST reference something specific and feel like you actually read the job.

MICRO-INSIGHT (MANDATORY):
Include 1 sharp observation. Must feel like expert diagnosis.

SOLUTION:
Short, clear, confident. Mention: """${experience || 'my standard process'}"""

FLOW:
Hook → Insight → Fix → CTA
Must feel natural, not structured.

LENGTH:
60–90 words ONLY.

TONE:
calm
confident
slightly detached expert
never desperate

CTA:
End with a soft, curiosity-based question. Example: "Worth a quick chat to map this out?"

VARIATION:
Do NOT reuse same sentence patterns.

OUTPUT FORMAT (STRICT JSON):
{
  "analysis": {
    "core_problem": "string",
    "implicit_pain": "string",
    "micro_insight": "string"
  },
  "output": {
    "subject": "4-6 word curiosity subject",
    "proposal": "60-90 word proposal text",
    "tips": [
      "psychology reason 1",
      "psychology reason 2",
      "psychology reason 3"
    ]
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
          { role: "user", content: `Job Description: """${jobDesc}"""` }
        ],
        temperature: 0.75, // Keep this at 0.75 so the "detached expert" tone has room to breathe
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const parsedJson = JSON.parse(data.choices[0].message.content);

    // We only send the "output" block to the frontend
    res.status(200).json({
      subject: parsedJson.output.subject,
      proposal: parsedJson.output.proposal,
      tips: parsedJson.output.tips
    });

  } catch (error) {
    console.error("GROQ API ERROR:", error);
    res.status(500).json({ error: "Failed to write proposal: " + error.message });
  }
}
