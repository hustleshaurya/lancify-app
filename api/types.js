/**
 * Shared contracts for the opportunity engine.
 *
 * This project does not currently include a TypeScript build step, so the
 * production endpoint stays as ESM JavaScript with JSDoc contracts. Editors and
 * TS-aware tooling still get typed boundaries across modules without changing
 * the deploy pipeline.
 *
 * @typedef {Object} LeadProfile
 * @property {string} sourceId
 * @property {string} name
 * @property {string} platform
 * @property {string} profileUrl
 * @property {string=} websiteUrl
 * @property {string=} description
 * @property {string=} location
 * @property {string=} phone
 * @property {number=} subscriberCount
 * @property {number=} avgRecentViews
 * @property {number=} viewSubRatio
 * @property {number=} lastUploadDays
 * @property {number=} rating
 * @property {number=} reviews
 * @property {string[]=} signals
 * @property {Record<string, unknown>=} metrics
 * @property {Record<string, unknown>=} raw
 *
 * @typedef {Object} IntentScore
 * @property {number} intentScore
 * @property {number} buyingIntent
 * @property {number} urgency
 * @property {number} monetizationReadiness
 * @property {number} painScore
 * @property {string[]} evidence
 *
 * @typedef {Object} ContactInfo
 * @property {string|null} email
 * @property {string[]} emails
 * @property {Record<string, string|null>} socialLinks
 * @property {string|null} phone
 * @property {number} availabilityScore
 * @property {string[]} validation
 *
 * @typedef {Object} LearningStats
 * @property {number} impressions
 * @property {number} replies
 * @property {number} conversions
 * @property {number} revenue
 * @property {number} replyRate
 * @property {number} conversionRate
 *
 * @typedef {Object} FinalLead
 * @property {string} name
 * @property {string} platform
 * @property {string} profileUrl
 * @property {number} intentScore
 * @property {number} qualityScore
 * @property {number} painScore
 * @property {number} replyProbability
 * @property {number} dealProbability
 * @property {ContactInfo} contactInfo
 * @property {{dm: string, email: string, loomScript: string}} outreach
 */

export {};
