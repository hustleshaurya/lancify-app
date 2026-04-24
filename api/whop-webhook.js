/*
Environment variables needed:
WHOP_WEBHOOK_SECRET=     # from Whop dashboard → webhooks
WHOP_PRO_MONTHLY_ID=     # Whop plan ID for Pro monthly
WHOP_PRO_ANNUAL_ID=      # Whop plan ID for Pro annual
WHOP_ELITE_MONTHLY_ID=   # Whop plan ID for Elite monthly
WHOP_ELITE_ANNUAL_ID=    # Whop plan ID for Elite annual

Run in Supabase SQL editor if the columns do not exist yet:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_elite boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whop_plan_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_activated_at timestamptz;
*/

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.WHOP_WEBHOOK_SECRET;
  const signature = req.headers['x-whop-signature'] || '';
  const body = JSON.stringify(req.body);

  if (secret) {
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (signature !== `sha256=${expected}`) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const { action, data } = req.body || {};
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const email = data?.user?.email || data?.membership?.user?.email || '';
  const planId = data?.plan?.id || data?.membership?.plan?.id || '';

  const PRO_MONTHLY_ID = process.env.WHOP_PRO_MONTHLY_ID;
  const PRO_ANNUAL_ID = process.env.WHOP_PRO_ANNUAL_ID;
  const ELITE_MONTHLY_ID = process.env.WHOP_ELITE_MONTHLY_ID;
  const ELITE_ANNUAL_ID = process.env.WHOP_ELITE_ANNUAL_ID;

  const isProPlan = [PRO_MONTHLY_ID, PRO_ANNUAL_ID].includes(planId);
  const isElitePlan = [ELITE_MONTHLY_ID, ELITE_ANNUAL_ID].includes(planId);

  if (!email) return res.status(400).json({ error: 'No email in payload' });

  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) return res.status(500).json({ error: 'Failed to list users' });

  const user = (users?.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const userId = user.id;

  if (action === 'membership.went_valid' || action === 'payment.succeeded') {
    const updatePayload = {
      user_id: userId,
      is_pro: isProPlan || isElitePlan,
      is_elite: isElitePlan,
      whop_plan_id: planId,
      plan_activated_at: new Date().toISOString(),
      credits_total: isElitePlan ? 10000 : isProPlan ? 3000 : 200,
      credits_remaining: isElitePlan ? 10000 : isProPlan ? 3000 : 200,
      credits_cycle_start: new Date().toISOString(),
      billing_usage: {},
    };

    await supabase.from('profiles').upsert([updatePayload], { onConflict: 'user_id' });
    return res.status(200).json({ success: true, plan: isElitePlan ? 'elite' : 'pro' });
  }

  if (action === 'membership.went_invalid' || action === 'membership.expired' || action === 'membership.cancelled') {
    await supabase.from('profiles').upsert([{
      user_id: userId,
      is_pro: false,
      is_elite: false,
      whop_plan_id: null,
      credits_total: 200,
      credits_remaining: 200,
      credits_cycle_start: new Date().toISOString(),
      billing_usage: {},
    }], { onConflict: 'user_id' });
    return res.status(200).json({ success: true, downgraded: true });
  }

  return res.status(200).json({ received: true });
}
