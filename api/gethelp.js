export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [], context = {}, attachments = [] } = req.body || {};
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

  const safeAttachments = Array.isArray(attachments)
    ? attachments
        .filter(file => file && typeof file.name === 'string')
        .slice(0, 5)
        .map(file => ({
          name: file.name.slice(0, 140),
          type: String(file.type || '').slice(0, 80),
          size: Number(file.size || 0),
          kind: file.kind === 'image' ? 'image' : 'file',
          text: typeof file.text === 'string' ? file.text.slice(0, 9000) : '',
          dataUrl: typeof file.dataUrl === 'string' && file.dataUrl.startsWith('data:image/') ? file.dataUrl : '',
          note: typeof file.note === 'string' ? file.note.slice(0, 500) : '',
        }))
    : [];

  const hasImages = safeAttachments.some(file => file.kind === 'image' && file.dataUrl);

  const systemPrompt = `You are Lancify AI Agent, the premium in-app support assistant for Lancify.

Lancify is a SaaS workspace for freelancers and agency operators. It helps users:
- find freelance/client opportunities with Opportunity Finder
- generate audits, proposals, cold emails, and outreach sequences
- manage leads and clients in a CRM/pipeline
- create invoices and track freelance earnings
- build growth roadmaps and use profile data to personalize AI output
- manage AI credits, plan limits, settings, subscription, and onboarding

Your job:
- Be strongly biased toward helping the user succeed inside Lancify. Prefer Lancify workflows, Lancify pages, and Lancify-specific fixes over generic advice.
- Instantly solve any query related to Lancify.
- Give practical, exact steps inside the app before general advice.
- If something is broken, diagnose likely causes and give a short fix checklist with the fastest path first.
- Explain plan and credit limits clearly without sounding salesy.
- For weak AI results, ask for missing client context and provide an improved prompt/input the user can paste into Lancify.
- For billing, pricing, subscription, refunds, payment failures, missing credits, account access, or any serious issue, include this escalation line: "If this is still not solved, email support@lancifyai.com. We reply within 1 hour."
- For screenshots or images, inspect what is visible and connect it to the exact Lancify fix. If the image is not readable, ask for the exact error text.
- For uploaded text/code files, use the attachment content to diagnose the problem.
- For billing, auth, or payment confusion, guide the user to profile menu > Subscription or Settings, and tell them what details to verify. Also include support@lancifyai.com.
- Never claim you performed an action in the app unless the user says it happened.
- Keep answers concise, premium, calm, and useful. Use a confident SaaS-support tone.
- Use bullet steps when fixing a problem.
- Ask one focused follow-up only if the answer depends on missing details.
- If a request is outside Lancify, briefly connect it back to freelancing or say you can only help with Lancify-related work.

Current app context from the browser:
${JSON.stringify(context, null, 2)}`;

  const attachmentSummary = safeAttachments.length
    ? `\n\nUser attachments:\n${safeAttachments.map((file, index) => {
        const base = `${index + 1}. ${file.name} (${file.type || 'unknown'}, ${file.size || 0} bytes)`;
        const content = file.text ? `\nContent excerpt:\n${file.text}` : '';
        const note = file.note ? `\nNote: ${file.note}` : '';
        return `${base}${content}${note}`;
      }).join('\n\n')}`
    : '';

  const userContent = hasImages
    ? [
        { type: 'text', text: `${message.slice(0, 2200)}${attachmentSummary}` },
        ...safeAttachments
          .filter(file => file.kind === 'image' && file.dataUrl)
          .map(file => ({
            type: 'image_url',
            image_url: { url: file.dataUrl },
          })),
      ]
    : `${message.slice(0, 2200)}${attachmentSummary}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: hasImages ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...safeHistory,
          { role: 'user', content: userContent },
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
