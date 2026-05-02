import { cleanText, clamp, lower, normalizeUrl, parseUsdNumber } from '../utils/text.js';

const DEFAULT_DB_NAME = 'lancify';
const DEFAULT_COLLECTION = 'leads';
const clientState = globalThis.__LANCIFY_MONGO_STATE__ || {
  client: null,
  db: null,
  indexesReady: false,
  connectPromise: null,
};
globalThis.__LANCIFY_MONGO_STATE__ = clientState;

/*
MongoDB collection: leads

{
  sourceId: string,              // unique index
  name: string,
  platform: string,
  profileUrl: string,
  websiteUrl: string | null,
  contactInfo: object,
  firstSeenAt: Date,
  lastSeenAt: Date,
  seenCount: number,
  timesContacted: number,
  replies: number,
  conversions: number,
  revenue: number,
  conversionHistory: [
    {
      type: "reply" | "conversion" | "contacted",
      at: Date,
      revenue?: number,
      strategy?: string,
      niche?: string,
      skill?: string
    }
  ],
  niche: string,
  skill: string,
  lastStrategy: string | null,
  location: {
    raw: string,
    normalized: string,
    city: string,
    country: string
  },
  updatedAt: Date
}

Indexes:
- { sourceId: 1 } unique
- { niche: 1, skill: 1, lastSeenAt: -1 }
- { "location.normalized": 1 }
- { conversions: -1, replies: -1, lastSeenAt: -1 }
*/

async function getMongoCollection(env, logger) {
  const uri = cleanText(env.MONGODB_URI || env.MONGO_URI || '');
  if (!uri) return null;

  if (clientState.db) {
    return clientState.db.collection(cleanText(env.MONGODB_LEADS_COLLECTION || DEFAULT_COLLECTION));
  }

  if (!clientState.connectPromise) {
    clientState.connectPromise = (async () => {
      try {
        const { MongoClient } = await import('mongodb');
        clientState.client = new MongoClient(uri, {
          maxPoolSize: Number(env.MONGODB_MAX_POOL_SIZE || 20),
          minPoolSize: Number(env.MONGODB_MIN_POOL_SIZE || 0),
          serverSelectionTimeoutMS: Number(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 3000),
        });
        await clientState.client.connect();
        clientState.db = clientState.client.db(cleanText(env.MONGODB_DB || DEFAULT_DB_NAME));
        const collection = clientState.db.collection(cleanText(env.MONGODB_LEADS_COLLECTION || DEFAULT_COLLECTION));

        if (!clientState.indexesReady) {
          await Promise.all([
            collection.createIndex({ sourceId: 1 }, { unique: true }),
            collection.createIndex({ niche: 1, skill: 1, lastSeenAt: -1 }),
            collection.createIndex({ 'location.normalized': 1 }),
            collection.createIndex({ conversions: -1, replies: -1, lastSeenAt: -1 }),
          ]);
          clientState.indexesReady = true;
        }

        logger?.info?.('mongo_lead_store_connected', {
          db: cleanText(env.MONGODB_DB || DEFAULT_DB_NAME),
          collection: cleanText(env.MONGODB_LEADS_COLLECTION || DEFAULT_COLLECTION),
        });
        return collection;
      } catch (error) {
        logger?.warn?.('mongo_lead_store_unavailable', { error });
        clientState.client = null;
        clientState.db = null;
        clientState.connectPromise = null;
        return null;
      }
    })();
  }

  return clientState.connectPromise;
}

function serializeContactInfo(contactInfo = {}) {
  return {
    email: cleanText(contactInfo.email) || null,
    emails: Array.isArray(contactInfo.emails) ? contactInfo.emails.map(cleanText).filter(Boolean).slice(0, 5) : [],
    socialLinks: contactInfo.socialLinks || {},
    phone: cleanText(contactInfo.phone) || null,
    website: cleanText(contactInfo.website) || null,
    availabilityScore: clamp(contactInfo.availabilityScore || 0, 0, 100),
    validation: Array.isArray(contactInfo.validation) ? contactInfo.validation.map(cleanText).filter(Boolean) : [],
  };
}

function serializeLead(profile, { skill, niche, strategy } = {}) {
  return {
    sourceId: cleanText(profile.sourceId),
    name: cleanText(profile.name),
    platform: cleanText(profile.platform),
    profileUrl: normalizeUrl(profile.profileUrl),
    websiteUrl: normalizeUrl(profile.websiteUrl || profile.website || ''),
    description: cleanText(profile.description).slice(0, 1000),
    contactInfo: serializeContactInfo(profile.contactInfo),
    niche: cleanText(profile.niche || niche || 'general'),
    skill: cleanText(skill || profile.skill || ''),
    lastStrategy: cleanText(profile.strategyKey || strategy || ''),
    location: {
      raw: cleanText(profile.location || profile.raw?.address || ''),
      normalized: cleanText(profile.normalizedLocation?.normalized || ''),
      city: cleanText(profile.normalizedLocation?.city || ''),
      country: cleanText(profile.normalizedLocation?.country || ''),
    },
  };
}

function getPerformance(doc = {}) {
  const seenCount = Number(doc.seenCount || 0);
  const timesContacted = Number(doc.timesContacted || 0);
  const replies = Number(doc.replies || 0);
  const conversions = Number(doc.conversions || 0);
  const revenue = Number(doc.revenue || 0);
  return {
    seenCount,
    timesContacted,
    replies,
    conversions,
    revenue,
    replyRate: timesContacted > 0 ? replies / timesContacted : 0,
    conversionRate: timesContacted > 0 ? conversions / timesContacted : 0,
  };
}

function daysSince(date) {
  const ts = new Date(date || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return 999;
  return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
}

function getLeadMemoryPriority(doc = null) {
  if (!doc) return 1.08;
  const perf = getPerformance(doc);
  const recencyDays = daysSince(doc.lastSeenAt);
  let score = 1;

  if (recencyDays <= 2) score -= 0.12;
  else if (recencyDays <= 7) score -= 0.08;
  else if (recencyDays >= 30) score += 0.06;

  if (perf.seenCount >= 5 && perf.conversionRate < 0.01) score -= 0.06;
  if (perf.replyRate >= 0.20) score += 0.06;
  if (perf.conversionRate >= 0.05) score += 0.10;
  if (perf.revenue >= 1000) score += 0.04;

  return clamp(Number(score.toFixed(3)), 0.82, 1.18);
}

async function findLeadMap(collection, sourceIds) {
  if (!collection || !sourceIds.length) return new Map();
  const docs = await collection.find(
    { sourceId: { $in: sourceIds } },
    {
      projection: {
        sourceId: 1,
        firstSeenAt: 1,
        lastSeenAt: 1,
        seenCount: 1,
        timesContacted: 1,
        replies: 1,
        conversions: 1,
        revenue: 1,
        niche: 1,
        skill: 1,
        lastStrategy: 1,
      },
    }
  ).toArray();
  return new Map(docs.map((doc) => [doc.sourceId, doc]));
}

export async function createLeadStore({ env = process.env, logger = null } = {}) {
  const collection = await getMongoCollection(env, logger);

  return {
    backend: collection ? 'mongodb' : 'disabled',

    async hydrateLeadMemory(profiles = []) {
      if (!collection || !profiles.length) {
        return profiles.map((profile) => ({
          ...profile,
          leadMemory: null,
          memoryPriorityScore: getLeadMemoryPriority(null),
        }));
      }

      const sourceIds = [...new Set(profiles.map((profile) => cleanText(profile.sourceId)).filter(Boolean))];
      const existing = await findLeadMap(collection, sourceIds);
      return profiles.map((profile) => {
        const doc = existing.get(profile.sourceId) || null;
        return {
          ...profile,
          leadMemory: doc ? getPerformance(doc) : null,
          memoryPriorityScore: getLeadMemoryPriority(doc),
          lastSeenAt: doc?.lastSeenAt || null,
        };
      });
    },

    async upsertDiscoveredLeads(profiles = [], { skill, niche, strategy } = {}) {
      if (!collection || !profiles.length) return;
      const now = new Date();
      const ops = profiles
        .filter((profile) => cleanText(profile.sourceId) && normalizeUrl(profile.profileUrl))
        .map((profile) => {
          const serialized = serializeLead(profile, { skill, niche, strategy });
          return {
            updateOne: {
              filter: { sourceId: serialized.sourceId },
              update: {
                $setOnInsert: {
                  sourceId: serialized.sourceId,
                  firstSeenAt: now,
                  timesContacted: 0,
                  replies: 0,
                  conversions: 0,
                  revenue: 0,
                  conversionHistory: [],
                },
                $set: {
                  ...serialized,
                  lastSeenAt: now,
                  updatedAt: now,
                },
                $inc: { seenCount: 1 },
              },
              upsert: true,
            },
          };
        });

      if (ops.length) await collection.bulkWrite(ops, { ordered: false });
    },

    async markLeadsContacted(leads = [], { skill, niche, strategy } = {}) {
      if (!collection || !leads.length) return;
      const now = new Date();
      const ops = leads
        .filter((lead) => cleanText(lead.sourceId))
        .map((lead) => ({
          updateOne: {
            filter: { sourceId: cleanText(lead.sourceId) },
            update: {
              $set: {
                contactInfo: serializeContactInfo(lead.contactInfo),
                niche: cleanText(lead.niche || niche || 'general'),
                skill: cleanText(skill || lead.skill || ''),
                lastStrategy: cleanText(lead.strategyKey || strategy || ''),
                updatedAt: now,
              },
              $inc: { timesContacted: 1 },
              $push: {
                conversionHistory: {
                  $each: [{
                    type: 'contacted',
                    at: now,
                    strategy: cleanText(lead.strategyKey || strategy || ''),
                    niche: cleanText(lead.niche || niche || 'general'),
                    skill: cleanText(skill || lead.skill || ''),
                  }],
                  $slice: -100,
                },
              },
            },
          },
        }));

      if (ops.length) await collection.bulkWrite(ops, { ordered: false });
    },

    async recordPerformance(event = {}) {
      if (!collection) return;
      const sourceId = cleanText(event.sourceId || event.leadId || '');
      if (!sourceId) return;

      const status = lower(event.status);
      const replied = event.replied === true || event.reply === true || status === 'replied' || status === 'converted';
      const converted = event.converted === true || status === 'converted';
      const revenue = converted ? Number(parseUsdNumber(event.revenue || event.dealValue) || 0) : 0;
      const now = new Date();

      await collection.updateOne(
        { sourceId },
        {
          $set: {
            updatedAt: now,
            niche: cleanText(event.niche || ''),
            skill: cleanText(event.skill || ''),
            lastStrategy: cleanText(event.strategy || event.strategyKey || ''),
          },
          $inc: {
            replies: replied ? 1 : 0,
            conversions: converted ? 1 : 0,
            revenue,
          },
          $push: {
            conversionHistory: {
              $each: [{
                type: converted ? 'conversion' : replied ? 'reply' : 'contacted',
                at: now,
                revenue,
                strategy: cleanText(event.strategy || event.strategyKey || ''),
                niche: cleanText(event.niche || ''),
                skill: cleanText(event.skill || ''),
              }],
              $slice: -100,
            },
          },
        }
      );
    },
  };
}
