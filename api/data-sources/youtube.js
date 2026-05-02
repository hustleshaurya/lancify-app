import { fetchJson } from '../utils/http.js';
import {
  cleanText,
  clamp,
  daysSince,
  formatCompactNumber,
  mapLimit,
  stableHash,
  uniqueBy,
} from '../utils/text.js';

function buildYouTubeUrl(path, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function youtubeGet(path, params, deps) {
  const { cache, logger } = deps;
  const url = buildYouTubeUrl(path, params);
  return fetchJson(url, {}, {
    timeoutMs: 9000,
    retries: 2,
    cache,
    cacheKey: `yt:${stableHash(url.replace(params.key, 'key'))}`,
    cacheTtlSeconds: 1800,
    logger,
  });
}

async function searchVideosForChannels({ apiKey, query, config, deps }) {
  const publishedAfter = new Date(Date.now() - Number(config.publishedAfterDays || 180) * 24 * 60 * 60 * 1000).toISOString();
  const order = cleanText(config.searchOrder || 'relevance').toLowerCase() === 'date' ? 'date' : 'relevance';
  const data = await youtubeGet('search', {
    part: 'snippet',
    q: query,
    type: 'video',
    order,
    maxResults: 18,
    relevanceLanguage: 'en',
    publishedAfter,
    key: apiKey,
  }, deps);

  return (data.items || [])
    .map((item) => ({
      channelId: cleanText(item?.snippet?.channelId),
      seedVideoTitle: cleanText(item?.snippet?.title),
      seedPublishedAt: cleanText(item?.snippet?.publishedAt),
    }))
    .filter((item) => item.channelId);
}

async function getChannels(apiKey, channelIds, deps) {
  if (!channelIds.length) return [];
  const chunks = [];
  for (let i = 0; i < channelIds.length; i += 50) chunks.push(channelIds.slice(i, i + 50));

  const results = await mapLimit(chunks, 2, async (ids) => {
    const data = await youtubeGet('channels', {
      part: 'snippet,statistics,brandingSettings',
      id: ids.join(','),
      key: apiKey,
    }, deps);
    return data.items || [];
  });

  return results.flat();
}

async function getRecentVideos(apiKey, channelId, deps) {
  const search = await youtubeGet('search', {
    part: 'snippet',
    channelId,
    type: 'video',
    order: 'date',
    maxResults: 6,
    key: apiKey,
  }, deps);
  const ids = (search.items || [])
    .map((item) => cleanText(item?.id?.videoId))
    .filter(Boolean);
  if (!ids.length) return [];

  const videos = await youtubeGet('videos', {
    part: 'snippet,statistics',
    id: ids.join(','),
    key: apiKey,
  }, deps);
  return videos.items || [];
}

function normalizeChannel(channel, videos, config) {
  const stats = channel.statistics || {};
  const snippet = channel.snippet || {};
  const subscriberCount = Number(stats.hiddenSubscriberCount ? 0 : stats.subscriberCount || 0);
  const videoViews = videos
    .map((video) => Number(video?.statistics?.viewCount || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgRecentViews = videoViews.length
    ? Math.round(videoViews.reduce((sum, value) => sum + value, 0) / videoViews.length)
    : 0;
  const latestVideo = videos
    .map((video) => cleanText(video?.snippet?.publishedAt))
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const latestTitle = cleanText(videos?.[0]?.snippet?.title || '');
  const viewSubRatio = subscriberCount > 0 ? avgRecentViews / subscriberCount : 0;
  const channelId = cleanText(channel.id);
  const description = cleanText(snippet.description).slice(0, 800);

  return {
    sourceId: `youtube:${channelId}`,
    name: cleanText(snippet.title),
    platform: 'YouTube',
    profileUrl: `https://www.youtube.com/channel/${channelId}`,
    websiteUrl: '',
    description,
    location: cleanText(snippet.country || ''),
    followers: formatCompactNumber(subscriberCount, 'subscribers'),
    subscriberCount,
    avgRecentViews,
    viewSubRatio,
    lastUploadDays: daysSince(latestVideo),
    latestVideoTitle: latestTitle,
    metrics: {
      totalViews: Number(stats.viewCount || 0),
      videoCount: Number(stats.videoCount || 0),
      avgRecentViews,
      viewSubRatio,
    },
    signals: [
      avgRecentViews >= Number(config.minAvgViews || 150) ? 'recent-view-volume' : null,
      viewSubRatio >= Number(config.minViewSubRatio || 0.004) ? 'view-sub-fit' : null,
      daysSince(latestVideo) <= 30 ? 'active-posting' : null,
    ].filter(Boolean),
    raw: { channel, sampleVideos: videos.slice(0, 3) },
  };
}

export async function searchYouTubeCreators({
  apiKey,
  queries,
  location = '',
  config = {},
  cache,
  logger,
}) {
  if (!apiKey) {
    logger?.warn?.('youtube_api_key_missing');
    return [];
  }

  const deps = { cache, logger };
  const queryList = (queries || []).slice(0, 8)
    .map((query) => cleanText(location ? `${query} ${location}` : query))
    .filter(Boolean);
  if (!queryList.length) return [];

  const searchResults = await mapLimit(queryList, 3, async (query) => {
    try {
      return searchVideosForChannels({ apiKey, query, config, deps });
    } catch (error) {
      logger?.warn?.('youtube_search_failed', { query, error });
      return [];
    }
  });

  const channelSeeds = uniqueBy(searchResults.flat(), (item) => item.channelId);
  const channels = await getChannels(apiKey, channelSeeds.map((item) => item.channelId), deps);
  const profiles = await mapLimit(channels, 4, async (channel) => {
    try {
      const videos = await getRecentVideos(apiKey, channel.id, deps);
      return normalizeChannel(channel, videos, config);
    } catch (error) {
      logger?.warn?.('youtube_video_enrichment_failed', { channelId: channel.id, error });
      return normalizeChannel(channel, [], config);
    }
  });

  return uniqueBy(profiles, (profile) => profile.sourceId)
    .filter((profile) => profile.name && profile.profileUrl)
    .map((profile) => ({
      ...profile,
      discoveryScore: clamp(
        55 + (Number(profile.signals?.length || 0) * 8) - Math.min(15, Number(profile.lastUploadDays || 0) / 20),
        40,
        95
      ),
    }));
}
