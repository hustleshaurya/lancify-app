export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobDesc, platform, experience, niche } = req.body;
  const groqApiKey = process.env.GROQ_API_KEY; 

  const modelName = "llama-3.3-70b-versatile";

  const systemPrompt = `You are an elite, top 1% freelance consultant (${niche}) pitching a client on ${platform}.

  Your goal is to write a high-converting, 60-90 word cold proposal. You do not beg for jobs. You diagnose problems and offer solutions.

  You must follow a strict Chain of Thought process before writing the proposal.

  PHASE 1: THE ANALYSIS (Hidden from client)
  1. Extract the Core Problem: What is the literal issue they need fixed?
  2. Identify the Implicit Pain: What is this actually costing them? (Time, lost revenue, stress, embarrassment?)
  3. Formulate a Micro-Insight: What is a 1-sentence expert diagnosis or strategic observation you can offer for free to prove you know your stuff?

  PHASE 2: THE PROPOSAL (The actual output)
  Write the proposal using the insights from Phase 1.

  STRICT COPYWRITING RULES:
  1. NO GREETINGS: Do not use "Hi", "Hello", "Dear Hiring Manager", or "I hope this finds you well."
  2. NO FLUFF: Banned phrases include: "I am interested", "I am the perfect fit", "I am a hard worker", "I can help you", "delve", "tapestry", "supercharge", "leverage".
  3. THE HOOK: The very first sentence MUST be a Pattern Interrupt. Directly state an observation about their specific business or job post.
  4. THE INSIGHT: Seamlessly drop your "Micro-Insight" to shift the dynamic from freelancer to consultant.
  5. BREVITY: The proposal MUST be between 60 and 90 words. Short, punchy, skimmable sentences.
  6. TONE: Calm, clinical, expert, and conversational. Do not sound excited or desperate.
  7. THE CTA: End with a soft, low-friction, curiosity-based question. (e.g., "Worth a quick chat to map out a fix?", "Want to see a quick wireframe of how I'd approach this?")
  8. VARIATION: Do not use the same sentence structure every time. Vary how you weave in the user's experience: """${experience || 'my standard process'}""".

  Return ONLY a raw JSON object in this exact format:
  {
    "analysis": {
      "core_problem": "string",
      "implicit_pain": "string",
      "micro_insight": "string"
    },
    "output": {
      "subject": "Punchy 4-5 word subject line",
      "proposal": "The 60-90 word pitch.",
      "tips": ["Tip 1", "Tip 2", "Tip 3"]
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
        temperature: 0.75, // 🔥 Bumped up to force human-like variation and kill the robotic tone
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const parsedJson = JSON.parse(data.choices[0].message.content);

    // We isolate the "output" block so your frontend UI stays completely unbroken
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
