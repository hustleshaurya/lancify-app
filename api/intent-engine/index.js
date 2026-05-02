import { fetchJson } from '../utils/http.js';
import { buildFallbackInsight } from '../scoring-engine/index.js';
import { getPriceHint, SKILL_INTENT_RULES } from '../utils/config.js';
import { cleanText, clamp, extractJson, lower, mapLimit } from '../utils/text.js';

function heuristicIntent(profile, skill, config) {
  const text = lower(`${profile.name} ${profile.description} ${profile.profileUrl} ${(profile.signals || []).join(' ')}`);
  const isCreator = config?.targetType === 'creator' || profile.platform === 'YouTube';
  let buyingIntent = 45;
  let urgency = 45;
  let monetizationReadiness = 45;

  if (isCreator) {
    if (Number(profile.lastUploadDays || 999) <= 14) urgency += 25;
    else if (Number(profile.lastUploadDays || 999) <= 30) urgency += 15;
    if (Number(profile.avgRecentViews || 0) >= 1000) buyingIntent += 12;
    if (Number(profile.viewSubRatio || 0) < 0.05) buyingIntent += 10;
    if (text.match(/sponsor|affiliate|course|membership|patreon|shop/)) monetizationReadiness += 25;
    if (Number(profile.subscriberCount || 0) >= 5000) monetizationReadiness += 12;
  } else {
    if (text.match(/pricing|book|schedule|consult|services|store|shop|buy/)) buyingIntent += 22;
    if (text.match(/new|opening|hiring|launch|sale|limited|now/)) urgency += 16;
    if (text.match(/pricing|shop|store|course|membership|checkout|cart/)) monetizationReadiness += 24;
    if (profile.websiteUrl || profile.phone) buyingIntent += 8;
    if (Number(profile.reviews || 0) >= 50) monetizationReadiness += 8;
  }

  const rule = SKILL_INTENT_RULES[skill] || {};
  const skillHits = (rule.requiredAny || []).filter((keyword) => text.includes(lower(keyword))).length;
  buyingIntent += skillHits * 5;

  const intentScore = Math.round((buyingIntent * 0.42) + (urgency * 0.25) + (monetizationReadiness * 0.33));
  const fallback = buildFallbackInsight(profile, skill, config);
  return {
    sourceId: profile.sourceId,
    intentScore: clamp(intentScore, 20, 96),
    buyingIntent: clamp(buyingIntent, 15, 98),
    urgency: clamp(urgency, 15, 98),
    monetizationReadiness: clamp(monetizationReadiness, 15, 98),
    painScore: null,
    problem: fallback.problem,
    strategy: fallback.strategy,
    whyNow: fallback.whyNow,
    evidence: [
      profile.platform === 'YouTube' ? `${profile.followers || 'creator'} with ${profile.avgRecentViews || 0} avg recent views` : cleanText(profile.description).slice(0, 140),
      profile.contactInfo?.email ? 'direct email found' : 'contact path needs validation',
    ].filter(Boolean),
    model: 'heuristic-fallback',
  };
}

async function classifyBatchWithGroq({ apiKey, model, profiles, skill, config, logger }) {
  const rule = SKILL_INTENT_RULES[skill] || {};
  const candidates = profiles.map((profile) => ({
    sourceId: profile.sourceId,
    name: profile.name,
    platform: profile.platform,
    profileUrl: profile.profileUrl,
    description: profile.description,
    followers: profile.followers,
    subscriberCount: profile.subscriberCount || null,
    avgRecentViews: profile.avgRecentViews || null,
    viewSubRatio: profile.viewSubRatio || null,
    lastUploadDays: profile.lastUploadDays || null,
    rating: profile.rating || null,
    reviews: profile.reviews || null,
    contactSignals: profile.contactInfo?.validation || [],
    signals: profile.signals || [],
  }));

  const prompt = `Classify lead intent for a freelance SaaS lead engine.

Skill being sold: ${skill || 'General freelance service'}
Expected deal range: ${getPriceHint(skill)}
Target mode: ${config?.targetType || 'business'}
Required service evidence: ${JSON.stringify(rule.requiredAny || [])}
Forbidden mismatches: ${JSON.stringify(rule.forbiddenAny || [])}

Use only the candidate sourceId values provided. Do not invent names, URLs, contact data, metrics, or evidence.
Return strict JSON array. Scores must be integers 0-100.

Candidates:
${JSON.stringify(candidates, null, 2)}

Schema:
[
  {
    "sourceId": "exact sourceId",
    "intentScore": 0,
    "buyingIntent": 0,
    "urgency": 0,
    "monetizationReadiness": 0,
    "painScore": 0,
    "problem": "one specific pain using observed candidate data",
    "strategy": "one specific outreach strategy tied to the selected skill",
    "whyNow": "why outreach is timely",
    "evidence": ["short observed fact", "short observed fact"]
  }
]`;

  const data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 2200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return only JSON in this shape: {"items":[...]}. Never invent facts.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  }, {
    timeoutMs: 25000,
    retries: 1,
    logger,
  });

  const parsed = extractJson(data?.choices?.[0]?.message?.content || '', { items: [] });
  return Array.isArray(parsed) ? parsed : (parsed.items || []);
}

function sanitizeIntent(item, profile, skill, config) {
  const fallback = heuristicIntent(profile, skill, config);
  const sourceId = cleanText(item?.sourceId);
  if (sourceId !== profile.sourceId) return fallback;

  return {
    sourceId: profile.sourceId,
    intentScore: clamp(Math.round(Number(item.intentScore ?? fallback.intentScore)), 0, 100),
    buyingIntent: clamp(Math.round(Number(item.buyingIntent ?? fallback.buyingIntent)), 0, 100),
    urgency: clamp(Math.round(Number(item.urgency ?? fallback.urgency)), 0, 100),
    monetizationReadiness: clamp(Math.round(Number(item.monetizationReadiness ?? fallback.monetizationReadiness)), 0, 100),
    painScore: clamp(Math.round(Number(item.painScore ?? fallback.intentScore)), 0, 100),
    problem: cleanText(item.problem) || fallback.problem,
    strategy: cleanText(item.strategy) || fallback.strategy,
    whyNow: cleanText(item.whyNow) || fallback.whyNow,
    evidence: Array.isArray(item.evidence) ? item.evidence.map(cleanText).filter(Boolean).slice(0, 4) : fallback.evidence,
    model: 'groq-llm-classifier',
  };
}

export async function classifyIntentForProfiles({
  profiles,
  skill,
  config,
  apiKey,
  model = 'llama-3.3-70b-versatile',
  logger,
}) {
  const candidates = (profiles || []).slice(0, 30);
  if (!candidates.length) return new Map();
  const byId = new Map(candidates.map((profile) => [profile.sourceId, profile]));

  if (!apiKey) {
    return new Map(candidates.map((profile) => [profile.sourceId, heuristicIntent(profile, skill, config)]));
  }

  const batches = [];
  for (let i = 0; i < candidates.length; i += 8) batches.push(candidates.slice(i, i + 8));
  const classified = await mapLimit(batches, 2, async (batch) => {
    try {
      return await classifyBatchWithGroq({ apiKey, model, profiles: batch, skill, config, logger });
    } catch (error) {
      logger?.warn?.('intent_llm_batch_failed_using_heuristics', { error });
      return batch.map((profile) => heuristicIntent(profile, skill, config));
    }
  });

  const intentById = new Map();
  for (const item of classified.flat()) {
    const profile = byId.get(cleanText(item?.sourceId));
    if (!profile) continue;
    intentById.set(profile.sourceId, sanitizeIntent(item, profile, skill, config));
  }

  for (const profile of candidates) {
    if (!intentById.has(profile.sourceId)) {
      intentById.set(profile.sourceId, heuristicIntent(profile, skill, config));
    }
  }

  return intentById;
}
