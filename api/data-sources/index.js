import { getSkillConfig } from '../utils/config.js';
import { cleanText, extractLocation, uniqueBy } from '../utils/text.js';
import { searchYouTubeCreators } from './youtube.js';
import { runSerpGoogle, runSerpMaps } from './serp.js';
import { runApifyMaps } from './maps.js';

function dedupeProfiles(profiles) {
  return uniqueBy(profiles, (profile) => profile.profileUrl || profile.sourceId || `${profile.name}:${profile.platform}`);
}

async function settleFlat(tasks) {
  const settled = await Promise.allSettled(tasks);
  return settled.flatMap((result) => result.status === 'fulfilled' ? result.value || [] : []);
}

export async function discoverProfiles({
  env,
  prompt,
  type,
  platform,
  skill,
  mode,
  cache,
  logger,
}) {
  const config = getSkillConfig(skill);
  const isQuickMode = cleanText(mode || 'quick').toLowerCase().includes('quick');
  const location = extractLocation(prompt);
  const serpApiKey = env.SERPAPI_KEY;
  const youtubeApiKey = env.YOUTUBE_API_KEY;
  const apifyToken = env.APIFY_API_TOKEN;

  if (isQuickMode && skill && config) {
    if (config.method === 'youtube') {
      let profiles = await searchYouTubeCreators({
        apiKey: youtubeApiKey,
        queries: config.ytQueries,
        location,
        config,
        cache,
        logger,
      });

      if (profiles.length < Number(config.minLeadCount || 3)) {
        const broadConfig = {
          ...config,
          minSubs: Math.max(500, Number(config.minSubs || 2000) - 1500),
          maxSubs: Number(config.maxSubs || 70000) + 50000,
          maxInactiveDays: Math.max(180, Number(config.maxInactiveDays || 90)),
          minAvgViews: Math.max(60, Number(config.minAvgViews || 180) - 100),
          minViewSubRatio: Math.max(0.002, Number(config.minViewSubRatio || 0.007) - 0.004),
          searchOrder: 'relevance',
          publishedAfterDays: Math.max(300, Number(config.publishedAfterDays || 180)),
        };
        const retry = await searchYouTubeCreators({
          apiKey: youtubeApiKey,
          queries: [
            ...(config.ytQueries || []),
            `${cleanText(skill)} youtube channel`,
            `${cleanText(skill)} creator`,
            cleanText(prompt).replace(/\bin [^,]+$/i, ''),
          ].filter(Boolean),
          location: '',
          config: broadConfig,
          cache,
          logger,
        });
        profiles = dedupeProfiles([...profiles, ...retry]);
      }

      return { profiles, config, location };
    }

    if (config.method === 'maps') {
      const mapsQuery = location ? `${config.apifyMaps} in ${location}` : config.apifyMaps;
      const serpQuery = `${config.serpQuery}${location ? ` in ${location}` : ''}`;
      const profiles = await settleFlat([
        runSerpMaps({ apiKey: serpApiKey, query: serpQuery, cache, logger }),
        runApifyMaps({ apiToken: apifyToken, query: mapsQuery, cache, logger }),
      ]);
      return { profiles: dedupeProfiles(profiles), config, location };
    }

    if (config.method === 'serp') {
      const primaryQuery = location ? `${config.serpQuery} ${location}` : config.serpQuery;
      const primary = await runSerpGoogle({
        apiKey: serpApiKey,
        query: primaryQuery,
        excludeTerms: config.exclude || [],
        allowDomains: config.allowDomains || [],
        cache,
        logger,
      });

      const fallbackQueries = primary.length >= 4 ? [] : [
        `${cleanText(skill)} business website ${location || ''}`.trim(),
        `${cleanText(prompt)} website -agency -fiverr -upwork`.trim(),
      ];
      const fallback = await settleFlat(fallbackQueries.map((query) => runSerpGoogle({
        apiKey: serpApiKey,
        query,
        excludeTerms: config.exclude || [],
        allowDomains: [],
        cache,
        logger,
      })));

      return { profiles: dedupeProfiles([...primary, ...fallback]), config, location };
    }
  }

  if (type === 'Local Businesses') {
    const profiles = await settleFlat([
      runSerpMaps({ apiKey: serpApiKey, query: prompt, cache, logger }),
      runApifyMaps({ apiToken: apifyToken, query: prompt, cache, logger }),
    ]);
    return { profiles: dedupeProfiles(profiles), config, location };
  }

  if (type === 'Content Creators') {
    const profiles = await searchYouTubeCreators({
      apiKey: youtubeApiKey,
      queries: [prompt],
      location,
      config: {
        targetType: 'creator',
        minSubs: 800,
        maxSubs: platform === 'youtube' ? 120000 : 90000,
        maxInactiveDays: 180,
        minAvgViews: 60,
        minViewSubRatio: 0.002,
        publishedAfterDays: 365,
      },
      cache,
      logger,
    });
    return { profiles, config: config || { targetType: 'creator' }, location };
  }

  const queryByType = {
    Startups: `site:producthunt.com/products ${prompt}`,
    'E-commerce Brands': `site:myshopify.com ${prompt} -blog -list -template`,
    'Coaches & Consultants': `site:linkedin.com/in ${prompt} coach OR consultant -recruiter`,
  };
  const query = queryByType[type] || prompt;
  const profiles = await runSerpGoogle({
    apiKey: serpApiKey,
    query,
    allowDomains: type === 'Startups' ? ['producthunt.com'] : [],
    excludeTerms: [],
    cache,
    logger,
  });
  return { profiles: dedupeProfiles(profiles), config, location };
}
