import { getPriceHint, hasGenericPhrase } from '../utils/config.js';
import { cleanText, clamp, isValidHttpUrl, normalizeDealValue } from '../utils/text.js';
import { buildFallbackInsight } from '../scoring-engine/index.js';

function validateName(name) {
  const value = cleanText(name);
  if (value.length < 2 || value.length > 120) return '';
  if (/^(home|index|login|sign up|contact)$/i.test(value)) return '';
  return value;
}

function sanitizeInsight(lead, skill, config) {
  const fallback = buildFallbackInsight(lead, skill, config);
  const intent = { ...(lead.intent || {}) };
  if (!intent.problem || hasGenericPhrase(intent.problem)) intent.problem = fallback.problem;
  if (!intent.strategy || hasGenericPhrase(intent.strategy)) intent.strategy = fallback.strategy;
  if (!intent.whyNow || hasGenericPhrase(intent.whyNow)) intent.whyNow = fallback.whyNow;
  return intent;
}

function sanitizeContactInfo(contactInfo = {}) {
  const socialLinks = contactInfo.socialLinks || {};
  return {
    email: cleanText(contactInfo.email) || null,
    emails: Array.isArray(contactInfo.emails) ? contactInfo.emails.map(cleanText).filter(Boolean) : [],
    socialLinks: {
      linkedin: cleanText(socialLinks.linkedin) || null,
      instagram: cleanText(socialLinks.instagram) || null,
      facebook: cleanText(socialLinks.facebook) || null,
      tiktok: cleanText(socialLinks.tiktok) || null,
      youtube: cleanText(socialLinks.youtube) || null,
    },
    phone: cleanText(contactInfo.phone) || null,
    website: cleanText(contactInfo.website) || null,
    availabilityScore: clamp(contactInfo.availabilityScore || 0, 0, 100),
    validation: Array.isArray(contactInfo.validation) ? contactInfo.validation.map(cleanText).filter(Boolean) : [],
  };
}

export function finalizeLeadOutput({ leads, sourceProfiles, skill, config }) {
  const sourceIds = new Set((sourceProfiles || []).map((profile) => profile.sourceId));
  const output = [];

  for (const lead of leads || []) {
    if (!sourceIds.has(lead.sourceId)) continue;
    const name = validateName(lead.name);
    if (!name || !isValidHttpUrl(lead.profileUrl)) continue;
    const intent = sanitizeInsight(lead, skill, config);
    const contactInfo = sanitizeContactInfo(lead.contactInfo);
    const outreach = {
      dm: cleanText(lead.outreach?.dm),
      email: cleanText(lead.outreach?.email),
      loomScript: cleanText(lead.outreach?.loomScript),
    };
    if (!outreach.dm || !outreach.email || !outreach.loomScript) continue;
    if (hasGenericPhrase(`${outreach.dm} ${outreach.email} ${outreach.loomScript}`)) continue;

    const dealValue = normalizeDealValue(lead.dealValue || getPriceHint(skill), getPriceHint(skill));

    output.push({
      sourceId: lead.sourceId,
      name,
      platform: cleanText(lead.platform || 'Website'),
      profileUrl: cleanText(lead.profileUrl),
      intentScore: clamp(Math.round(Number(lead.intent?.intentScore || lead.intentScore || 0)), 0, 100),
      qualityScore: clamp(Math.round(Number(lead.qualityScore || 0)), 0, 100),
      painScore: clamp(Math.round(Number(lead.painScore || intent.painScore || 0)), 0, 100),
      replyProbability: clamp(Math.round(Number(lead.replyProbability || 0)), 0, 100),
      dealProbability: clamp(Math.round(Number(lead.dealProbability || 0)), 0, 100),
      contactInfo: {
        email: contactInfo.email,
        socialLinks: contactInfo.socialLinks,
      },
      outreach,
      dealValue,
      quickDm: outreach.dm,
      loomScript: outreach.loomScript,
      proposal: outreach.email,
      replyChance: clamp(Math.round(Number(lead.replyProbability || 0)), 0, 100),
      match: clamp(Math.round(Number(lead.qualityScore || 0)), 0, 100),
      problem: intent.problem,
      strategy: intent.strategy,
      whyNow: intent.whyNow,
    });
  }

  return output.sort((a, b) => {
    const left = (b.intentScore * 0.35) + (b.qualityScore * 0.30) + (b.replyProbability * 0.20) + (b.dealProbability * 0.15);
    const right = (a.intentScore * 0.35) + (a.qualityScore * 0.30) + (a.replyProbability * 0.20) + (a.dealProbability * 0.15);
    return left - right;
  });
}
