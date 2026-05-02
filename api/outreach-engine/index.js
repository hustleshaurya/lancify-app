import { fetchJson } from '../utils/http.js';
import { getPriceHint, hasGenericPhrase } from '../utils/config.js';
import { cleanText, extractJson, mapLimit, normalizeDealValue } from '../utils/text.js';

function buildFactLine(lead) {
  if (lead.platform === 'YouTube') {
    return `${lead.followers || 'Not listed'}; ${lead.avgRecentViews || 0} avg recent views; latest activity ${lead.lastUploadDays ?? 'unknown'} days ago`;
  }
  if (lead.platform === 'Google Maps') {
    return `${lead.rating || 'No'} rating; ${lead.reviews || 0} reviews; ${lead.contactInfo?.website ? 'website found' : 'website not found'}`;
  }
  return cleanText(lead.description).slice(0, 160) || lead.platform;
}

function strategyInstruction(strategy) {
  const key = cleanText(strategy || 'specific-audit').toLowerCase();
  const instructions = {
    'thumbnail-teardown': 'lead with one concrete visual packaging teardown',
    'retention-sprint': 'lead with a short retention and hook improvement sprint',
    'voice-sample': 'lead with one short sample read tied to their content style',
    'content-calendar': 'lead with a 7-day content cadence improvement',
    'conversion-audit': 'lead with one page-level conversion fix',
    'copy-teardown': 'lead with one specific copy rewrite angle',
    'sequence-map': 'lead with one simple email sequence map',
    'technical-seo-audit': 'lead with one technical SEO issue and its expected impact',
    'booking-funnel-audit': 'lead with one booking-flow friction point',
    'creative-sprint': 'lead with one product creative test sprint',
    'ad-angle-audit': 'lead with one ad angle test based on observed positioning',
    'content-gap-brief': 'lead with one content gap and a starter brief',
  };
  return instructions[key] || 'lead with one specific observed issue and a low-risk starter fix';
}

function fallbackOutreach(lead, skill, selectedStrategy) {
  const name = cleanText(lead.name || 'there');
  const problem = cleanText(lead.intent?.problem || lead.problem || `${name} has a visible ${skill || 'growth'} gap`);
  const strategy = cleanText(lead.intent?.strategy || lead.strategy || `share one specific fix and offer a small implementation sprint`);
  const whyNow = cleanText(lead.intent?.whyNow || lead.whyNow || 'there is current activity to attach the outreach to');
  const strategyHint = strategyInstruction(lead.strategyKey || selectedStrategy);
  const fact = buildFactLine(lead);
  const deal = normalizeDealValue(getPriceHint(skill));

  const dm = [
    `Hey ${name}, noticed this while reviewing your ${lead.platform}: ${fact}.`,
    `${problem}`,
    `I would ${strategyHint}: ${strategy}.`,
    `Open to a quick teardown? If useful, I can scope a starter sprint around ${deal}.`,
  ].join('\n');

  const email = [
    `Subject: Specific ${skill || 'growth'} fix for ${name}`,
    '',
    `Hi ${name},`,
    '',
    `I reviewed your ${lead.platform} presence and noticed: ${fact}.`,
    `${problem}`,
    '',
    `The first move I would make is to ${strategyHint}: ${strategy}. ${whyNow}.`,
    '',
    `I can package this as a low-risk starter sprint around ${deal}, with a clear before/after check so it is easy to judge.`,
    '',
    `Worth sending over the quick version?`,
  ].join('\n');

  const loomScript = [
    `Hi ${name}, this is a quick teardown of your ${lead.platform}.`,
    `First, the concrete signal: ${fact}.`,
    `The opportunity I see: ${problem}.`,
    `The first fix: ${strategyHint}: ${strategy}.`,
    `Why now: ${whyNow}.`,
    `Simple next step: I can turn this into one focused starter deliverable around ${deal}.`,
  ].join('\n');

  return { dm, email, loomScript };
}

async function generateOutreachBatch({ leads, skill, strategy, apiKey, model, logger }) {
  const payload = leads.map((lead) => ({
    sourceId: lead.sourceId,
    name: lead.name,
    platform: lead.platform,
    profileUrl: lead.profileUrl,
    realFacts: buildFactLine(lead),
    problem: lead.intent?.problem || lead.problem,
    strategy: lead.intent?.strategy || lead.strategy,
    strategyKey: lead.strategyKey || strategy,
    strategyInstruction: strategyInstruction(lead.strategyKey || strategy),
    whyNow: lead.intent?.whyNow || lead.whyNow,
    contactable: Boolean(lead.contactInfo?.email || Object.values(lead.contactInfo?.socialLinks || {}).some(Boolean)),
    replyProbability: lead.replyProbability,
    dealProbability: lead.dealProbability,
  }));

  const prompt = `Generate high-specificity outreach for these leads.

Skill being sold: ${skill || 'General freelance service'}
Preferred outreach strategy: ${strategy || 'specific-audit'}
Rules:
- Use only the realFacts, problem, strategy, whyNow, name, platform, and URL provided.
- Do not invent metrics, clients, revenue, email addresses, or missing facts.
- Avoid generic claims like "improve online presence" or "grow your business".
- DM must be concise and natural.
- Email must include a subject line.
- Loom script must be a spoken 45-60 second script.

Return strict JSON: {"items":[{"sourceId":"...", "dm":"...", "email":"...", "loomScript":"..."}]}

Leads:
${JSON.stringify(payload, null, 2)}`;

  const data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.28,
      max_tokens: 2600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return only valid JSON. Never invent facts.' },
        { role: 'user', content: prompt },
      ],
    }),
  }, {
    timeoutMs: 25000,
    retries: 1,
    logger,
  });

  const parsed = extractJson(data?.choices?.[0]?.message?.content || '', { items: [] });
  return parsed.items || [];
}

function isSpecificEnough(text, lead) {
  const value = cleanText(text);
  if (value.length < 80) return false;
  if (hasGenericPhrase(value)) return false;
  const nameToken = cleanText(lead.name).split(/\s+/)[0]?.toLowerCase();
  return value.toLowerCase().includes(nameToken) || value.includes(lead.platform);
}

export async function buildOutreachForLeads({
  leads,
  skill,
  strategy,
  apiKey,
  model = 'llama-3.3-70b-versatile',
  logger,
}) {
  const base = new Map((leads || []).map((lead) => [lead.sourceId, fallbackOutreach(lead, skill, strategy)]));
  if (!apiKey || !(leads || []).length) {
    return (leads || []).map((lead) => ({ ...lead, outreach: base.get(lead.sourceId) }));
  }

  const batches = [];
  for (let i = 0; i < leads.length; i += 5) batches.push(leads.slice(i, i + 5));
  const generated = await mapLimit(batches, 2, async (batch) => {
    try {
      return await generateOutreachBatch({ leads: batch, skill, strategy, apiKey, model, logger });
    } catch (error) {
      logger?.warn?.('outreach_llm_batch_failed_using_fallback', { error });
      return [];
    }
  });

  const byId = new Map(generated.flat().map((item) => [cleanText(item.sourceId), item]));
  return (leads || []).map((lead) => {
    const ai = byId.get(lead.sourceId);
    const fallback = base.get(lead.sourceId);
    const outreach = {
      dm: cleanText(ai?.dm) || fallback.dm,
      email: cleanText(ai?.email) || fallback.email,
      loomScript: cleanText(ai?.loomScript) || fallback.loomScript,
    };
    if (!isSpecificEnough(outreach.dm, lead)) outreach.dm = fallback.dm;
    if (!isSpecificEnough(outreach.email, lead)) outreach.email = fallback.email;
    if (!isSpecificEnough(outreach.loomScript, lead)) outreach.loomScript = fallback.loomScript;
    return { ...lead, outreach };
  });
}
