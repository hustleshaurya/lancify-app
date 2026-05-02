import { clamp, lower } from '../utils/text.js';

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function activitySignal(profile) {
  if (profile.platform === 'YouTube') {
    const days = Number(profile.lastUploadDays || 999);
    if (days <= 7) return 1;
    if (days <= 14) return 0.85;
    if (days <= 30) return 0.65;
    if (days <= 90) return 0.35;
    return 0.1;
  }
  if (Number(profile.reviews || 0) >= 150) return 0.85;
  if (Number(profile.reviews || 0) >= 50) return 0.65;
  if (profile.websiteUrl || profile.phone) return 0.45;
  return 0.25;
}

function engagementSignal(profile) {
  if (profile.platform === 'YouTube') {
    const ratio = Number(profile.viewSubRatio || 0);
    if (ratio >= 0.10) return 0.95;
    if (ratio >= 0.06) return 0.75;
    if (ratio >= 0.03) return 0.55;
    return 0.25;
  }
  const rating = Number(profile.rating || 0);
  const reviews = Number(profile.reviews || 0);
  if (rating >= 4.6 && reviews >= 50) return 0.85;
  if (rating >= 4.2) return 0.65;
  if (reviews >= 20) return 0.50;
  return 0.35;
}

function monetizationSignal(profile, intent) {
  const text = lower(`${profile.description} ${profile.profileUrl}`);
  let signal = Number(intent?.monetizationReadiness || 50) / 100;
  if (text.match(/pricing|shop|store|course|membership|book|consult|buy|checkout|sponsor|affiliate/)) signal += 0.16;
  if (profile.platform === 'YouTube' && Number(profile.subscriberCount || 0) >= 5000) signal += 0.08;
  return clamp(signal, 0, 1);
}

export function predictConversionForLead({ profile, learningAdjustments = {} }) {
  const intent = profile.intent || {};
  const quality = Number(profile.qualityScore || 60) / 100;
  const pain = Number(profile.painScore || intent.painScore || 55) / 100;
  const contact = Number(profile.contactInfo?.availabilityScore || profile.contactabilityScore || 25) / 100;
  const activity = activitySignal(profile);
  const engagement = engagementSignal(profile);
  const monetization = monetizationSignal(profile, intent);
  const learningLift = Number(learningAdjustments?.scoreBoost || 0) / 100;

  const replyLogit = -2.05
    + (1.30 * quality)
    + (0.95 * contact)
    + (0.70 * activity)
    + (0.45 * engagement)
    + (0.60 * (Number(intent.intentScore || 55) / 100))
    + learningLift;
  const dealLogit = -2.85
    + (1.05 * quality)
    + (0.80 * pain)
    + (0.90 * monetization)
    + (0.52 * engagement)
    + (0.35 * contact)
    + learningLift;

  const replyProbability = clamp(Math.round(sigmoid(replyLogit) * 100), 5, 92);
  const dealProbability = clamp(Math.round(sigmoid(dealLogit) * 100), 2, Math.min(76, replyProbability - 1));

  return {
    replyProbability,
    dealProbability,
    conversionBreakdown: {
      quality: Math.round(quality * 100),
      contactability: Math.round(contact * 100),
      activity: Math.round(activity * 100),
      engagement: Math.round(engagement * 100),
      monetization: Math.round(monetization * 100),
      learningBoost: Number(learningAdjustments?.scoreBoost || 0),
    },
  };
}

export function predictConversions({ profiles, learningAdjustments }) {
  return (profiles || []).map((profile) => {
    const prediction = predictConversionForLead({ profile, learningAdjustments });
    return { ...profile, ...prediction };
  });
}
