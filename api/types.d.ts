export interface LeadProfile {
  sourceId: string;
  name: string;
  platform: string;
  profileUrl: string;
  websiteUrl?: string;
  description?: string;
  location?: string;
  phone?: string;
  subscriberCount?: number;
  avgRecentViews?: number;
  viewSubRatio?: number;
  lastUploadDays?: number;
  rating?: number;
  reviews?: number;
  signals?: string[];
  metrics?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface IntentScore {
  sourceId: string;
  intentScore: number;
  buyingIntent: number;
  urgency: number;
  monetizationReadiness: number;
  painScore: number;
  problem: string;
  strategy: string;
  whyNow: string;
  evidence: string[];
  model: 'groq-llm-classifier' | 'heuristic-fallback';
}

export interface ContactInfo {
  email: string | null;
  emails?: string[];
  socialLinks: {
    linkedin?: string | null;
    instagram?: string | null;
    facebook?: string | null;
    tiktok?: string | null;
    youtube?: string | null;
  };
  phone?: string | null;
  website?: string | null;
  availabilityScore?: number;
  validation?: string[];
}

export interface LearningStats {
  impressions: number;
  replies: number;
  conversions: number;
  revenue: number;
  replyRate: number;
  conversionRate: number;
}

export interface OutreachAssets {
  dm: string;
  email: string;
  loomScript: string;
}

export interface FinalLead {
  name: string;
  platform: string;
  profileUrl: string;
  intentScore: number;
  qualityScore: number;
  painScore: number;
  replyProbability: number;
  dealProbability: number;
  contactInfo: {
    email: string | null;
    socialLinks: ContactInfo['socialLinks'];
  };
  outreach: OutreachAssets;
}
