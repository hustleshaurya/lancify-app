export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [], context = {} } = req.body || {};
  const GROQ = process.env.GROQ_API_KEY;

  if (!GROQ) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured.' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const safeHistory = Array.isArray(history)
    ? history
        .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-10)
        .map(item => ({ role: item.role, content: item.content.slice(0, 1600) }))
    : [];

  const systemPrompt = `You are Lancify AI Agent, the premium in-app support assistant for Lancify.

Lancify is a SaaS workspace for freelancers and agency operators. It helps users:
- find freelance/client opportunities with Opportunity Finder
- generate audits, proposals, cold emails, and outreach sequences
- manage leads and clients in a CRM/pipeline
- create invoices and track freelance earnings
- build growth roadmaps and use profile data to personalize AI output
- manage AI credits, plan limits, settings, subscription, and onboarding

Your job:
- Instantly solve any query related to Lancify.
- Give practical, exact steps inside the app before general advice.
- If something is broken, diagnose likely causes and give a short fix checklist.
- Explain plan and credit limits clearly without sounding salesy.
- For weak AI results, ask for missing client context and provide an improved prompt/input.
- For billing, auth, or payment confusion, guide the user to profile menu > Subscription or Settings, and tell them what details to verify.
- Never claim you performed an action in the app unless the user says it happened.
- Keep answers concise, premium, calm, and useful.
- Use bullet steps when fixing a problem.
- Ask one focused follow-up only if the answer depends on missing details.
- If a request is outside Lancify, briefly connect it back to freelancing or say you can only help with Lancify-related work.

Current app context from the browser:
${JSON.stringify(context, null, 2)}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...safeHistory,
          { role: 'user', content: message.slice(0, 2200) },
        ],
        temperature: 0.35,
        max_tokens: 900,
      }),
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Groq request failed with ${response.status}`);
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Groq returned an empty response.');

    return res.status(200).json({ reply });
  } catch (error) {
    console.error('GETHELP API ERROR:', error);
    return res.status(500).json({ error: 'Failed to generate help response: ' + error.message });
  }
}
