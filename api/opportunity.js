// api/opportunity.js
// Production-grade AI lead generation engine.
//
// The endpoint is intentionally thin: all domain behavior lives in modular
// layers so source discovery, scoring, intent, learning, contact extraction,
// conversion prediction, outreach, and quality gates can evolve independently.

import { discoverProfiles } from './data-sources/index.js';
import { enrichContactsForProfiles } from './contact-engine/index.js';
import { classifyIntentForProfiles } from './intent-engine/index.js';
import { createLearningEngine } from './learning-engine/index.js';
import { createLeadStore } from './persistence-engine/index.js';
import { buildOutreachForLeads } from './outreach-engine/index.js';
import { finalizeLeadOutput } from './quality-engine/index.js';
import { predictConversions } from './conversion-engine/index.js';
import {
  applyAdvancedProfileFilters,
  buildCandidatePool,
  normalizeAdvancedControls,
  pickDiverseTopLeads,
  scoreProfiles,
} from './scoring-engine/index.js';
import {
  computeLeadTarget,
  estimateScanCredits,
  getDefaultStrategy,
  getNicheForSkill,
  getSkillConfig,
  resolvePlanTier,
} from './utils/config.js';
import { createCache } from './utils/cache.js';
import { createLogger } from './utils/logger.js';
import { enforceRateLimit, RateLimitError } from './utils/rate-limit.js';
import { createLeadQueue } from './utils/queue.js';
import { filterByLocation } from './utils/location.js';
import { cleanText, clamp, lower, toArray } from './utils/text.js';

function getClientIp(req) {
  const forwarded = cleanText(req?.headers?.['x-forwarded-for']).split(',')[0];
  return forwarded || cleanText(req?.socket?.remoteAddress || req?.connection?.remoteAddress || 'unknown');
}

function normalizeSignalTokens(signals = []) {
  const out = new Set();
  for (const raw of toArray(signals)) {
    const signal = lower(raw);
    if (!signal) continue;
    if (signal.includes('active')) out.add('active-posting');
    if (signal.includes('engagement') || signal.includes('views') || signal.includes('ctr')) out.add('high-engagement');
    if (signal.includes('intent') || signal.includes('cta') || signal.includes('funnel') || signal.includes('lead')) out.add('high-intent');
  }
  return [...out];
}

function normalizeBudgetTokens(budget = []) {
  const out = new Set();
  for (const raw of toArray(budget)) {
    const value = lower(raw);
    if (!value) continue;
    if (value.includes('low') || value.includes('starter')) out.add('low-ticket');
    if (value.includes('mid') || value.includes('standard')) out.add('mid-ticket');
    if (value.includes('high') || value.includes('premium')) out.add('high-ticket');
  }
  return [...out];
}

function resolveEffectivePrompt({ prompt, skill, type, isQuickMode }) {
  return cleanText(prompt)
    || (cleanText(skill) ? `${cleanText(skill)} leads` : '')
    || (isQuickMode ? `${cleanText(type)} leads` : '');
}

function getGroqModel(env) {
  return cleanText(env.GROQ_MODEL || 'llama-3.3-70b-versatile');
}

async function handleFeedback({ body, learning, leadStore }) {
  const event = body.feedback || body.event || body;
  const [stats] = await Promise.all([
    learning.recordFeedback(event),
    leadStore.recordPerformance(event),
  ]);
  return {
    ok: true,
    type: 'feedback_recorded',
    stats,
  };
}

async function runOpportunityScan({ req, body, cache, logger, learning, leadStore }) {
  const {
    type = 'Local Businesses',
    prompt = '',
    platform = 'all',
    skill = null,
    mode = 'quick',
    incomeGoal = null,
    signals = [],
    budget = [],
    targetLocation = '',
  } = body;

  const isQuickMode = lower(mode).includes('quick');
  const effectivePrompt = resolveEffectivePrompt({ prompt, skill, type, isQuickMode });
  if (!effectivePrompt) {
    const error = new Error('No prompt provided');
    error.statusCode = 400;
    throw error;
  }

  const planTier = resolvePlanTier(body);
  const leadTarget = computeLeadTarget({ incomeGoal, skill, planTier });
  const rankWindow = clamp(Math.max(12, leadTarget.requestedLeadCount * 4), 12, leadTarget.planMaxCandidates);
  const sourceConfig = getSkillConfig(skill);
  const niche = getNicheForSkill(skill, sourceConfig?.targetType || '');
  const strategy = await learning.getBestStrategy(niche, getDefaultStrategy(skill));
  const learningAdjustments = await learning.getAdjustments({ niche, strategy });

  logger.info('opportunity_scan_started', {
    mode,
    type,
    skill,
    prompt: effectivePrompt,
    planTier,
    rankWindow,
    cacheBackend: cache.backend,
  });

  const discovery = await discoverProfiles({
    env: process.env,
    prompt: effectivePrompt,
    type,
    platform,
    skill,
    mode,
    cache,
    logger,
  });

  const config = discovery.config || sourceConfig || {};
  const rawProfiles = discovery.profiles || [];
  const locationTarget = cleanText(targetLocation || body.locationTarget || body.location || '');
  const locationScopedProfiles = filterByLocation(rawProfiles, locationTarget, {
    minMatches: Math.min(3, leadTarget.requestedLeadCount),
  });
  const memoryAwareProfiles = await leadStore.hydrateLeadMemory(locationScopedProfiles);
  await leadStore.upsertDiscoveredLeads(memoryAwareProfiles, { skill, niche, strategy });

  const candidatePool = buildCandidatePool(memoryAwareProfiles, config, isQuickMode);
  const advanced = normalizeAdvancedControls(body);
  const advancedScoped = isQuickMode
    ? candidatePool
    : applyAdvancedProfileFilters(candidatePool, config, advanced, skill);

  const preRanked = scoreProfiles({
    profiles: advancedScoped,
    config,
    skill,
    learningAdjustments,
    signals: normalizeSignalTokens(signals),
    budget: normalizeBudgetTokens(budget),
  }).slice(0, rankWindow);

  logger.info('opportunity_profiles_ranked', {
    raw: rawProfiles.length,
    locationScoped: locationScopedProfiles.length,
    candidatePool: candidatePool.length,
    advanced: advancedScoped.length,
    preRanked: preRanked.length,
  });

  if (!preRanked.length) {
    return {
      leads: [],
      source: 'live',
      empty: true,
      warning: config?.targetType === 'creator'
        ? 'No active creators found with enough quality and intent signals. Try a broader niche keyword or remove location.'
        : 'No quality leads found. Try a different location, skill, or broader prompt.',
    };
  }

  const withContacts = await enrichContactsForProfiles({
    profiles: preRanked,
    cache,
    logger,
    maxProfiles: isQuickMode ? Math.min(leadTarget.requestedLeadCount * 3, 14) : Math.min(rankWindow, 28),
  });

  const contactsById = new Map(withContacts.map((profile) => [profile.sourceId, profile.contactInfo]));
  const intentsById = await classifyIntentForProfiles({
    profiles: withContacts,
    skill,
    config,
    apiKey: process.env.GROQ_API_KEY,
    model: getGroqModel(process.env),
    logger,
  });

  const scored = scoreProfiles({
    profiles: withContacts,
    config,
    skill,
    intentsById,
    contactsById,
    learningAdjustments,
    signals: normalizeSignalTokens(signals),
    budget: normalizeBudgetTokens(budget),
  });

  const filteredAfterIntent = isQuickMode
    ? scored
    : applyAdvancedProfileFilters(scored, config, advanced, skill);

  const predicted = predictConversions({
    profiles: filteredAfterIntent,
    learningAdjustments,
  });

  const selected = pickDiverseTopLeads(predicted, leadTarget.requestedLeadCount, skill);
  const withOutreach = await buildOutreachForLeads({
    leads: selected,
    skill,
    strategy,
    apiKey: process.env.GROQ_API_KEY,
    model: getGroqModel(process.env),
    logger,
  });

  await Promise.all([
    learning.recordScanOutput(withOutreach),
    leadStore.markLeadsContacted(withOutreach, { skill, niche, strategy }),
  ]);

  const finalLeads = finalizeLeadOutput({
    leads: withOutreach,
    sourceProfiles: rawProfiles,
    skill,
    config,
  }).slice(0, leadTarget.requestedLeadCount);

  const estimatedCredits = estimateScanCredits({
    isQuickMode,
    leadCount: finalLeads.length,
    planTier,
    usedAi: Boolean(process.env.GROQ_API_KEY),
  });

  logger.info('opportunity_scan_completed', {
    returned: finalLeads.length,
    requested: leadTarget.requestedLeadCount,
    estimatedCredits,
  });

  return {
    leads: finalLeads,
    source: 'live',
    count: finalLeads.length,
    targeting: {
      incomeGoalUsd: leadTarget.incomeGoalUsd,
      avgDealUsd: leadTarget.avgDealUsd,
      requestedLeadCount: leadTarget.requestedLeadCount,
      returnedLeadCount: finalLeads.length,
    },
    usage: {
      planTier,
      estimatedCredits,
      billingModel: 'base + per-lead credits (plan-aware)',
    },
  };
}

export default async function handler(req, res) {
  const logger = createLogger('opportunity-engine');
  const cache = createCache(process.env, logger);
  const learning = createLearningEngine({ cache, logger });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const leadStore = await createLeadStore({ env: process.env, logger });

    await enforceRateLimit({
      cache,
      key: `opportunity:${getClientIp(req)}`,
      limit: Number(process.env.OPPORTUNITY_RATE_LIMIT || 45),
      windowSeconds: Number(process.env.OPPORTUNITY_RATE_WINDOW_SECONDS || 60),
    });

    const body = req.body || {};
    const action = lower(body.action || body.type || '');
    if (action === 'feedback' || body.feedback || body.eventType === 'lead_feedback') {
      const payload = await handleFeedback({ body, learning, leadStore });
      return res.status(200).json(payload);
    }

    if (body.async === true || lower(body.executionMode).includes('queue')) {
      const queue = await createLeadQueue(process.env, logger);
      const queued = await queue.enqueue('scan', {
        body,
        requestedAt: new Date().toISOString(),
      });
      if (queued.queued) {
        return res.status(202).json({
          queued: true,
          jobId: queued.jobId,
          backend: queued.backend,
          status: 'accepted',
        });
      }
      logger.warn('queue_requested_but_unavailable_processing_inline', { backend: queued.backend });
    }

    const payload = await runOpportunityScan({ req, body, cache, logger, learning, leadStore });
    return res.status(200).json(payload);
  } catch (error) {
    logger.error('opportunity_engine_error', { error });
    if (error instanceof RateLimitError || error.statusCode === 429) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds || 60));
      return res.status(429).json({
        error: error.message,
        retryAfterSeconds: error.retryAfterSeconds || 60,
        leads: [],
        source: 'rate_limited',
      });
    }

    return res.status(error.statusCode || 500).json({
      error: error?.message || 'Scan failed',
      leads: [],
      source: 'error',
    });
  }
}
