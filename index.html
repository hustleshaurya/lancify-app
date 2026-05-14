export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { emailType, tone, context, niche } = req.body;
  const groqApiKey = process.env.GROQ_API_KEY;
  const modelName = "llama-3.3-70b-versatile";

  // ── TONE MODIFIERS ────────────────────────────────────────────────────────
  const TONE_STYLE = {
    'Professional': 'Calm, precise, zero fluff. No exclamation marks. Sounds like a senior consultant.',
    'Friendly':     'Warm but still sharp. Conversational. One contraction allowed. Still no filler phrases.',
    'Direct':       'Blunt. No softening language. Every word earns its place. No "just" or "maybe".',
    'Assertive':    'Confident. States outcomes as certainties. Assumes the reply is coming. No hedging.',
  };

  const toneStyle = TONE_STYLE[tone] || TONE_STYLE['Professional'];

  // ── EMAIL TYPE BLUEPRINTS ─────────────────────────────────────────────────
  const TYPE_BLUEPRINTS = {
    'Cold Outreach': {
      goal: 'Get a reply from a stranger who gets 50+ cold messages a week.',
      structure: `
Part 1 — HOOK (1 sentence): A specific, true observation about their situation.
  - Must name something from the context (channel name, video title, follower count, problem spotted).
  - Do NOT open with "I noticed", "I saw", "I came across", "I wanted to reach out".
  - Write the observation AS a fact, not a narration of your observation.
  - GOOD: "MarcusLifts is pulling 8K subscribers but recent videos are capped at 300 views."
  - BAD: "I noticed your videos aren't getting as many views as expected."

Part 2 — OFFER BRIDGE (1 sentence): What you do + what outcome it creates for them.
  - Name your specific service. Name the result. Be concrete.
  - GOOD: "Thumbnail redesigns have pushed similar fitness channels from 2% to 6% CTR within 3 weeks."
  - BAD: "I can help you get more views with better thumbnails."

Part 3 — SOFT CLOSE (1 sentence): The single lowest-friction question to get a reply.
  - Must be answerable in under 6 words.
  - GOOD: "Want me to mock one up for free?"
  - GOOD: "Would a sample make sense here?"
  - BAD: "Let me know if you're interested."
  - BAD: "Are you open to exploring this further?"`,
    },

    'Follow Up': {
      goal: 'Re-open a conversation without sounding desperate or passive-aggressive.',
      structure: `
Part 1 — ACKNOWLEDGE (1 sentence): Reference the previous touchpoint directly.
  - Name the specific thing you sent/said before. No vague "I reached out recently."
  - GOOD: "Sent over the thumbnail samples last Tuesday — wanted to see if you had a chance to look."

Part 2 — ADD VALUE (1 sentence): Give them one new thing — a result, a tip, a relevant observation.
  - This is not a repeat of your original pitch. New information only.
  - GOOD: "One of my other clients just hit 8% CTR on a similar fitness channel after the rebrand."

Part 3 — EASY OUT (1 sentence): Give them an easy way to say no OR an easy way to say yes.
  - Frame it so both options feel comfortable.
  - GOOD: "Still relevant, or should I check back another time?"`,
    },

    'Invoice Reminder': {
      goal: 'Get paid without damaging the relationship.',
      structure: `
Part 1 — STATE THE FACT (1 sentence): Name the invoice, the amount, and how many days overdue.
  - No softening language. Just the fact.
  - GOOD: "Invoice #42 for $350 was due 5 days ago and is still showing as unpaid."

Part 2 — ASSUME GOOD INTENT (1 sentence): Give them a face-saving assumption.
  - GOOD: "Likely just slipped through — happens to everyone."

Part 3 — CLEAR NEXT STEP (1 sentence): Tell them exactly what to do.
  - GOOD: "Payment link is in the original invoice — let me know if you need me to resend it."`,
    },

    'Proposal Follow Up': {
      goal: 'Re-engage a prospect who went quiet after receiving a proposal.',
      structure: `
Part 1 — REFRAME THE PROPOSAL (1 sentence): Reference the proposal by its specific detail, not generically.
  - GOOD: "The 5-thumbnail package proposal I sent last week — still on the table."

Part 2 — REMOVE FRICTION (1 sentence): Address the most likely objection or offer a smaller entry point.
  - GOOD: "If $150 upfront feels like a lot, I can start with one thumbnail at $35 to show you the quality."

Part 3 — DECISION PROMPT (1 sentence): Force a yes/no. Don't leave it open-ended.
  - GOOD: "Worth moving forward, or is the budget timing off right now?"`,
    },

    'Thank You': {
      goal: 'Leave a strong impression and plant the seed for the next engagement.',
      structure: `
Part 1 — SPECIFIC THANKS (1 sentence): Thank them for something specific, not "for your time."
  - GOOD: "Working on the MarcusLifts thumbnails was a solid project — the CTR data will be worth watching."

Part 2 — FORWARD SIGNAL (1 sentence): Plant one seed for future work without being pushy.
  - GOOD: "If you ever want to test a Shorts-specific thumbnail format, that's a gap I've seen work well."

Part 3 — OPEN DOOR (1 sentence): Leave it open with zero pressure.
  - GOOD: "Either way, glad it came together."`,
    },
  };

  const blueprint = TYPE_BLUEPRINTS[emailType] || TYPE_BLUEPRINTS['Cold Outreach'];

  // ── SYSTEM PROMPT ─────────────────────────────────────────────────────────
  const systemPrompt = `You are a world-class freelance sales copywriter. You write emails that get replies from busy people who ignore 95% of their inbox.

Your job: Write a ${emailType} email for a freelancer.
Their niche: ${niche || 'Freelance Services'}
Tone: ${toneStyle}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT PROVIDED BY THE FREELANCER:
"""${context}"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — EXTRACT BEFORE YOU WRITE (internal, do not output this):
Before writing a single word of the email, extract these from the context above:
- Client's name (if given)
- Client's platform/channel/business name (if given)
- One specific number or metric mentioned (follower count, invoice amount, days overdue, etc.)
- One specific detail that proves you looked (video title, product name, problem noticed, etc.)
- The service being offered and the price/timeline (if given)
- The ONE outcome the client actually wants (more views, getting paid, booking a call, etc.)

If ANY of these are in the context, they MUST appear in the email body. No exceptions.
If a client name is given, use it. If a video title is given, reference it. If a price is given, mention it.
A generic email that ignores the context is a FAILED output — rewrite until every specific detail is used.

STEP 2 — WRITE THE EMAIL using this exact structure:
Goal of this email type: ${blueprint.goal}
${blueprint.structure}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE HARD RULES — VIOLATION = REWRITE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. NEVER open with: "I noticed", "I saw", "I came across", "I wanted to", "Hope this finds you", "My name is", "I'm reaching out"
2. NEVER use the recipient's name in the subject line
3. NEVER ask two questions — ONE question maximum, at the very end only
4. NEVER say: "let me know if you're interested", "I'd love to", "I can help you", "just checking in", "circling back", "touching base", "Are you aware"
5. NEVER be vague — if context has specific names/numbers, they go in the email
6. NEVER exceed 4 sentences in the body total
7. Subject line: 3-6 words, all lowercase, no recipient name, sounds like a message from a colleague
8. Every sentence must feel like it could ONLY have been written for this specific person
9. The body must make the reader think "how does this person know that?" — not "who is this?"
10. No exclamation marks unless tone is Friendly

SUBJECT LINE RULES:
- Reference something specific from their situation
- Create curiosity without being clickbait
- GOOD: "your 8k subs aren't converting" / "invoice #42 — quick note" / "re: the proposal"
- BAD: "Quick question" / "Following up" / "Exciting opportunity" / "Hi Marcus"

OUTPUT — strict JSON only, no markdown, no backticks:
{
  "subject": "3-6 word lowercase subject line, no recipient name",
  "body": "the email body. exactly 3-4 sentences. \\n\\n between paragraphs if needed.",
  "alternativeSubject": "second subject line option, different angle, also lowercase",
  "tips": [
    "one specific reason THIS subject line gets opened (reference what makes it work for this specific context)",
    "one specific reason the closing question gets a reply (reference the psychology for this email type)"
  ]
}`;

  // ── CALL GROQ ─────────────────────────────────────────────────────────────
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
          {
            role: "user",
            content: `Write the ${emailType} email now. Context: """${context}""". Tone: ${tone}. Niche: ${niche}.

STEP 1 — Extract from the context:
- Channel/business name: (find it)
- Subscriber/follower count or key number: (find it)  
- Specific video title or product or exact problem observed: (find it)
- Service + price: (find it)

STEP 2 — Write EXACTLY 4 sentences using this formula:

Sentence 1 — THE GAP (12-15 words):
State the contrast between their size and their results using real numbers.
Formula: "[Channel name] has [X] subscribers but [specific video/recent content] is pulling [Y] views."
Example: "MarcusLifts has 8,400 subscribers but 'Why I stopped doing cardio' pulled 300 views."
NEVER say "subs" — write "subscribers". NEVER skip the video title or specific detail.

Sentence 2 — THE ROOT CAUSE (10-13 words):
Name the EXACT problem causing the gap. Be diagnostic, not preachy.
Formula: "That gap is almost always [specific cause] — [one-line explanation of the mechanism]."
Example: "That gap is almost always a CTR problem — plain text thumbnails with no face get scrolled past."
NEVER say "lack engaging visuals" or "need better content" — be specific about the mechanism.

Sentence 3 — THE PROOF (13-17 words):
State a believable result from your work. Use relative language, not fake percentages.
Formula: "I [did X] for [type of client] and [specific outcome] within [timeframe]."
Example: "I redesigned thumbnails for two similar fitness channels and both saw views double within the first month."
NEVER say "can boost" or "has been shown to" — say what actually happened with past clients.

Sentence 4 — THE CLOSE (7-10 words):
One soft yes/no question. Reference the specific thing you can do for them.
Formula: "Want me to mock one up for [specific thing] for free?"
Example: "Want me to mock one up for that video for free?"
NEVER say "Is a free mockup useful?" or "Let me know if interested" — sound like a human.

FINAL CHECK before outputting:
- Does sentence 1 name the channel AND a specific video title or number? If no → rewrite sentence 1.
- Does sentence 2 name the specific mechanism (not just "bad thumbnails")? If no → rewrite sentence 2.
- Does sentence 3 use past tense ("I did X") not future tense ("I can do X")? If no → rewrite sentence 3.
- Is the closing question under 10 words and answerable with yes/no? If no → rewrite sentence 4.`
          }
        ],
        temperature: 0.72,
        response_format: { type: "json_object" },
        max_tokens: 800,
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.choices?.[0]) throw new Error("Empty response from AI");

    const parsed = JSON.parse(data.choices[0].message.content);

    res.status(200).json({
      subject:             parsed.subject            || '',
      body:                parsed.body               || '',
      tips:                parsed.tips               || [],
      alternativeSubject:  parsed.alternativeSubject || null,
    });

  } catch (error) {
    console.error("[Email] GROQ ERROR:", error);
    res.status(500).json({ error: "Failed to write email: " + error.message });
  }
}
