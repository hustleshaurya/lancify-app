// api/opportunity.js

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { targetType, prompt } = req.body;

    // ---------------------------------------------------------
    // 🛑 DAY 5 APIFY DROP ZONE 🛑
    // When we activate Apify, we will delete the mock data below 
    // and uncomment the fetch call to the Apify API here.
    //
    // const apifyRes = await fetch('https://api.apify.com/v2/acts/YOUR_ACTOR/runs?token=YOUR_TOKEN', { ... });
    // const liveLeads = await apifyRes.json();
    // ---------------------------------------------------------

    // 2. Simulate server processing time (makes the UI radar look cool)
    await new Promise((resolve) => setTimeout(resolve, 2800));

    // 3. The Premium Mock Database (Moves from Frontend to Backend)
    const _oppLeadBank = {
      'Content Creators': [
        {
          name: 'FitWithNehaa', platform: 'YouTube', followers: '14.2k subscribers',
          problem: 'Thumbnails are plain text on white — no contrast, no faces, no hooks. CTR likely below 2%.',
          strategy: 'Send a before/after thumbnail redesign mockup as the cold pitch. Offer 5 thumbnails for ₹3,000 as a starter package.',
          match: 96, reason: 'Based on low CTR patterns + weak thumbnail design',
          jobDesc: 'Looking for a freelancer to redesign 5 YouTube thumbnails for a fitness channel.'
        },
        {
          name: 'TravelDiariesByKaran', platform: 'Instagram', followers: '8.7k followers',
          problem: 'Posting inconsistently — 3 posts last month, zero Reels. Engagement dropped 60% in 90 days.',
          strategy: 'Pitch a monthly content calendar + 8 Reels/month package. Lead with the engagement stat as the hook.',
          match: 91, reason: 'Based on dropping engagement rates and lack of short-form video',
          jobDesc: 'Need a social media manager to handle Instagram content and Reels for a travel creator.'
        },
        {
          name: 'SkillsWithPriya', platform: 'LinkedIn', followers: '3.1k followers',
          problem: 'Posts are long-form only — no carousel posts. Low reach despite solid expertise.',
          strategy: 'Offer a LinkedIn content system: 8 posts/month (4 carousels + 4 text) targeting professional growth audience.',
          match: 88, reason: 'Based on missing carousel formats which algorithm currently favors',
          jobDesc: 'Looking for a LinkedIn content writer who can create carousel posts.'
        }
      ],
      'Local Businesses': [
        {
          name: 'Chai & Chapters Café', platform: 'Instagram', followers: '2.3k followers',
          problem: 'Bio link goes to a dead page. No clear CTA in posts. Great photos but zero conversion path.',
          strategy: 'Fix the link-in-bio → landing page first. Then pitch a social media package.',
          match: 94, reason: 'Critical conversion bottleneck: Broken bio link',
          jobDesc: 'A local café needs someone to manage Instagram and fix their bio link.'
        },
        {
          name: 'GreenLeaf Salon', platform: 'Website', followers: 'Google: 4.1★',
          problem: 'Website loads in 7.2s, not mobile-optimised, no booking widget. Losing walk-ins.',
          strategy: 'Lead with the 7-second load time and lost bookings angle. Offer a website revamp + Calendly integration.',
          match: 93, reason: 'Failed Core Web Vitals speed test + missing calendar',
          jobDesc: 'Salon wants a faster, mobile-friendly website with an online appointment booking system.'
        },
        {
          name: 'QuickFix Electronics', platform: 'Google Maps', followers: '127 reviews, 3.8★',
          problem: 'Review score below local average of 4.2★. No response to negative reviews.',
          strategy: 'Offer a reputation management starter: review response templates + QR code system.',
          match: 87, reason: 'Reputation score flagged as below local competitor median',
          jobDesc: 'Small shop needs help managing online reviews.'
        }
      ],
      'Startups': [
        {
          name: 'Zolvr (SaaS)', platform: 'Product Hunt', followers: '312 upvotes',
          problem: 'Landing page copy is feature-heavy, not benefit-driven. No social proof above fold.',
          strategy: 'Offer a landing page copy audit as a free value-add, then pitch a full copy rewrite.',
          match: 95, reason: 'Identified high bounce rate indicators on hero section',
          jobDesc: 'Early-stage SaaS startup needs a copywriter to rewrite homepage.'
        },
        {
          name: 'Mealio App', platform: 'LinkedIn', followers: '890 followers',
          problem: 'App screenshots in Play Store are plain UI dumps. Reviews mention "confusing onboarding".',
          strategy: 'Pitch a 60-second explainer video + redesigned app store screenshots.',
          match: 90, reason: 'Based on negative keyword density in recent app reviews',
          jobDesc: 'Food-tech startup needs a short explainer video.'
        },
        {
          name: 'Hirrdly (HR Tool)', platform: 'Website', followers: '—',
          problem: 'Blog has 2 posts from 6 months ago. SEO score is 34/100. Missing product-led content.',
          strategy: 'Offer 4 long-form SEO articles/month targeting HR manager keywords.',
          match: 85, reason: 'Ahrefs domain rating check + inactive content schedule',
          jobDesc: 'B2B HR software company needs an SEO content writer.'
        }
      ]
    };

    // 4. Fetch the leads based on the target type
    const pool = _oppLeadBank[targetType] || _oppLeadBank['Local Businesses'];
    const leads = [...pool].sort(() => Math.random() - 0.45).slice(0, 3);

    // 5. Send data back to frontend
    return res.status(200).json({ leads });

  } catch (error) {
    console.error("Opportunity Engine Error:", error);
    return res.status(500).json({ error: 'Failed to scan opportunities.' });
  }
}
