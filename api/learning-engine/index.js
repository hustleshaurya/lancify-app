import { cleanText, clamp, parseUsdNumber } from '../utils/text.js';

const GLOBAL_KEY = 'learning:global';
const STRATEGY_INDEX_KEY = 'learning:strategy:index';
const LEAD_META_TTL_SECONDS = 60 * 60 * 24 * 180;

function blankStats() {
  return {
    impressions: 0,
    replies: 0,
    conversions: 0,
    revenue: 0,
    replyRate: 0,
    conversionRate: 0,
  };
}

function normalizeStats(stats) {
  const next = { ...blankStats(), ...(stats || {}) };
  next.impressions = Number(next.impressions || 0);
  next.replies = Number(next.replies || 0);
  next.conversions = Number(next.conversions || 0);
  next.revenue = Number(next.revenue || 0);
  next.replyRate = next.impressions ? Number((next.replies / next.impressions).toFixed(4)) : 0;
  next.conversionRate = next.impressions ? Number((next.conversions / next.impressions).toFixed(4)) : 0;
  return next;
}

function nicheKey(niche) {
  return `learning:niche:${cleanText(niche || 'general').toLowerCase()}`;
}

function strategyKey(strategy) {
  return `learning:strategy:${cleanText(strategy || 'specific-audit').toLowerCase()}`;
}

function nicheStrategyIndexKey(niche) {
  return `learning:niche-strategy:index:${cleanText(niche || 'general').toLowerCase()}`;
}

function nicheStrategyKey(niche, strategy) {
  return `learning:niche-strategy:${cleanText(niche || 'general').toLowerCase()}:${cleanText(strategy || 'specific-audit').toLowerCase()}`;
}

function leadMetaKey(leadId) {
  return `learning:lead:${cleanText(leadId).toLowerCase()}`;
}

function normalizeWeights(weights) {
  const entries = Object.entries(weights || {})
    .map(([key, value]) => [key, Math.max(0, Number(value || 0))])
    .filter(([, value]) => Number.isFinite(value) && value > 0);
  const sum = entries.reduce((total, [, value]) => total + value, 0);
  if (!entries.length || sum <= 0) return weights;
  return Object.fromEntries(entries.map(([key, value]) => [key, Number((value / sum).toFixed(4))]));
}

export function getAdaptiveWeights(baseWeights, learningStats = {}) {
  const stats = normalizeStats(learningStats);
  if (stats.impressions < 10) return normalizeWeights(baseWeights);

  const adjusted = { ...baseWeights };
  const replyRate = Number(stats.replyRate || 0);
  const conversionRate = Number(stats.conversionRate || 0);

  const replyLift = replyRate >= 0.12 ? 1.10 : replyRate <= 0.04 ? 0.92 : 1.00;
  const conversionLift = conversionRate >= 0.04 ? 1.12 : conversionRate <= 0.01 ? 0.94 : 1.00;

  if ('contactability' in adjusted) adjusted.contactability *= replyLift;
  if ('activity' in adjusted) adjusted.activity *= replyLift >= 1 ? 1.06 : 0.96;
  if ('intent' in adjusted) adjusted.intent *= conversionLift;
  if ('offerFit' in adjusted) adjusted.offerFit *= conversionLift >= 1 ? 1.07 : 0.97;
  if ('monetization' in adjusted) adjusted.monetization *= conversionLift;

  return normalizeWeights(adjusted);
}

export function getNichePriorityScore(nicheStats = {}) {
  const stats = normalizeStats(nicheStats);
  if (stats.impressions < 10) return 1;

  const revenuePerConversion = stats.conversions > 0 ? stats.revenue / stats.conversions : 0;
  let boost = 1;

  if (stats.conversionRate >= 0.05) boost += 0.10;
  else if (stats.conversionRate >= 0.03) boost += 0.06;
  else if (stats.conversionRate <= 0.005) boost -= 0.06;

  if (revenuePerConversion >= 1000) boost += 0.05;
  else if (stats.revenue === 0 && stats.impressions >= 25) boost -= 0.03;

  return clamp(Number(boost.toFixed(3)), 0.90, 1.15);
}

async function bumpStats(cache, key, patch, ttlSeconds = 60 * 60 * 24 * 180) {
  const current = normalizeStats(await cache.get(key));
  const next = normalizeStats({
    impressions: current.impressions + Number(patch.impressions || 0),
    replies: current.replies + Number(patch.replies || 0),
    conversions: current.conversions + Number(patch.conversions || 0),
    revenue: current.revenue + Number(patch.revenue || 0),
  });
  await cache.set(key, next, ttlSeconds);
  return next;
}

export function createLearningEngine({ cache, logger }) {
  return {
    async recordScanOutput(leads = []) {
      const strategyIndex = new Set(await cache.get(STRATEGY_INDEX_KEY) || []);
      const nicheStrategyIndexes = new Map();
      for (const lead of leads) {
        const niche = lead.niche || 'general';
        const strategy = lead.strategyKey || lead.outreachStrategy || 'specific-audit';
        const leadId = lead.sourceId || lead.profileUrl;
        strategyIndex.add(strategy);
        if (!nicheStrategyIndexes.has(niche)) {
          nicheStrategyIndexes.set(niche, new Set(await cache.get(nicheStrategyIndexKey(niche)) || []));
        }
        nicheStrategyIndexes.get(niche).add(strategy);

        await Promise.all([
          bumpStats(cache, GLOBAL_KEY, { impressions: 1 }),
          bumpStats(cache, nicheKey(niche), { impressions: 1 }),
          bumpStats(cache, strategyKey(strategy), { impressions: 1 }),
          bumpStats(cache, nicheStrategyKey(niche, strategy), { impressions: 1 }),
          leadId ? cache.set(leadMetaKey(leadId), { niche, strategy }, LEAD_META_TTL_SECONDS) : Promise.resolve(),
        ]);
      }
      await Promise.all([
        cache.set(STRATEGY_INDEX_KEY, [...strategyIndex], LEAD_META_TTL_SECONDS),
        ...[...nicheStrategyIndexes.entries()].map(([niche, index]) =>
          cache.set(nicheStrategyIndexKey(niche), [...index], LEAD_META_TTL_SECONDS)
        ),
      ]);
    },

    async recordFeedback(event = {}) {
      const leadId = cleanText(event.sourceId || event.leadId || event.profileUrl || '');
      const leadMeta = leadId ? await cache.get(leadMetaKey(leadId)) : null;
      const niche = cleanText(event.niche || leadMeta?.niche || event.skill || 'general');
      const strategy = cleanText(event.strategy || event.strategyKey || leadMeta?.strategy || 'specific-audit');
      const replied = event.replied === true || event.reply === true || cleanText(event.status).toLowerCase() === 'replied';
      const converted = event.converted === true || cleanText(event.status).toLowerCase() === 'converted';
      const revenue = converted ? Number(parseUsdNumber(event.dealValue || event.revenue) || 0) : 0;
      const patch = {
        impressions: Number(event.impression || event.sent || 0) ? 1 : 0,
        replies: replied ? 1 : 0,
        conversions: converted ? 1 : 0,
        revenue,
      };

      const strategyIndex = new Set(await cache.get(STRATEGY_INDEX_KEY) || []);
      const nicheStrategyIndex = new Set(await cache.get(nicheStrategyIndexKey(niche)) || []);
      strategyIndex.add(strategy);
      nicheStrategyIndex.add(strategy);
      const [global, nicheStats, strategyStats, nicheStrategyStats] = await Promise.all([
        bumpStats(cache, GLOBAL_KEY, patch),
        bumpStats(cache, nicheKey(niche), patch),
        bumpStats(cache, strategyKey(strategy), patch),
        bumpStats(cache, nicheStrategyKey(niche, strategy), patch),
        cache.set(STRATEGY_INDEX_KEY, [...strategyIndex], LEAD_META_TTL_SECONDS),
        cache.set(nicheStrategyIndexKey(niche), [...nicheStrategyIndex], LEAD_META_TTL_SECONDS),
      ]);

      logger?.info?.('lead_feedback_recorded', { niche, strategy, replied, converted, revenue });
      return { global, niche: nicheStats, strategy: strategyStats, nicheStrategy: nicheStrategyStats };
    },

    async getStats({ niche, strategy } = {}) {
      const [global, nicheStats, strategyStats, nicheStrategyStats] = await Promise.all([
        cache.get(GLOBAL_KEY),
        cache.get(nicheKey(niche || 'general')),
        cache.get(strategyKey(strategy || 'specific-audit')),
        cache.get(nicheStrategyKey(niche || 'general', strategy || 'specific-audit')),
      ]);
      return {
        global: normalizeStats(global),
        niche: normalizeStats(nicheStats),
        strategy: normalizeStats(strategyStats),
        nicheStrategy: normalizeStats(nicheStrategyStats),
      };
    },

    async getBestStrategy(niche, fallback = 'specific-audit') {
      const index = await cache.get(nicheStrategyIndexKey(niche || 'general')) || [];
      if (!Array.isArray(index) || !index.length) return fallback;

      const candidates = await Promise.all(index.map(async (strategy) => ({
        strategy,
        stats: normalizeStats(await cache.get(nicheStrategyKey(niche, strategy))),
      })));

      const ranked = candidates
        .filter(({ stats }) => stats.impressions >= 5)
        .map(({ strategy, stats }) => ({
          strategy,
          score: (stats.replyRate * 0.35)
            + (stats.conversionRate * 0.50)
            + (Math.min(stats.revenue / 10000, 1) * 0.15),
        }))
        .sort((a, b) => b.score - a.score);

      return ranked[0]?.strategy || fallback;
    },

    async getAdjustments({ niche, strategy } = {}) {
      const bestStrategy = await this.getBestStrategy(niche, strategy || 'specific-audit');
      const stats = await this.getStats({ niche, strategy: bestStrategy });
      const globalReply = stats.global.replyRate || 0.08;
      const globalConv = stats.global.conversionRate || 0.02;
      const enoughNicheData = stats.niche.impressions >= 10;
      const enoughStrategyData = stats.nicheStrategy.impressions >= 10 || stats.strategy.impressions >= 10;
      const nicheReplyLift = enoughNicheData ? (stats.niche.replyRate - globalReply) : 0;
      const strategyStats = stats.nicheStrategy.impressions >= 10 ? stats.nicheStrategy : stats.strategy;
      const strategyConvLift = enoughStrategyData ? (strategyStats.conversionRate - globalConv) : 0;
      const scoreBoost = clamp(Math.round((nicheReplyLift * 80) + (strategyConvLift * 120)), -8, 10);
      const adaptiveStats = {
        impressions: stats.niche.impressions + strategyStats.impressions,
        replies: stats.niche.replies + strategyStats.replies,
        conversions: stats.niche.conversions + strategyStats.conversions,
        revenue: stats.niche.revenue + strategyStats.revenue,
      };

      return {
        stats,
        scoreBoost,
        nichePriorityScore: getNichePriorityScore(stats.niche),
        suggestedStrategy: bestStrategy,
        weights: {
          creator: getAdaptiveWeights({
            intent: 0.24,
            activity: 0.19,
            engagement: 0.18,
            demand: 0.15,
            sizeFit: 0.12,
            contactability: 0.08,
            offerFit: 0.04,
          }, normalizeStats(adaptiveStats)),
          maps: getAdaptiveWeights({
            intent: 0.26,
            trust: 0.18,
            demand: 0.19,
            listingCompleteness: 0.12,
            contactability: 0.17,
            offerFit: 0.08,
          }, normalizeStats(adaptiveStats)),
          web: getAdaptiveWeights({
            intent: 0.29,
            domainQuality: 0.18,
            monetization: 0.17,
            contactability: 0.18,
            offerFit: 0.10,
            freshness: 0.08,
          }, normalizeStats(adaptiveStats)),
        },
      };
    },
  };
}
