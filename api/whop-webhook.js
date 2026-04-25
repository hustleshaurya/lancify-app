import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Temporarily skip signature check for sandbox testing
  // Re-enable after sandbox is confirmed working

  const { action, data } = req.body || {};
const action = req.body?.action || req.headers['x-whop-event'] || req.body?.type || '';
  console.log('[Whop Webhook] action:', action);
  console.log('[Whop Webhook] data:', JSON.stringify(data));

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const email =
    data?.user?.email ||
    data?.membership?.user?.email ||
    data?.email ||
    '';

  const planId =
    data?.plan?.id ||
    data?.membership?.plan?.id ||
    data?.plan_id ||
    '';

  console.log('[Whop Webhook] email:', email, '| planId:', planId);

  const PRO_MONTHLY_ID  = process.env.WHOP_PRO_MONTHLY_ID;
  const PRO_ANNUAL_ID   = process.env.WHOP_PRO_ANNUAL_ID;
  const ELITE_MONTHLY_ID = process.env.WHOP_ELITE_MONTHLY_ID;
  const ELITE_ANNUAL_ID  = process.env.WHOP_ELITE_ANNUAL_ID;

  const isProPlan   = [PRO_MONTHLY_ID, PRO_ANNUAL_ID].includes(planId);
  const isElitePlan = [ELITE_MONTHLY_ID, ELITE_ANNUAL_ID].includes(planId);

  if (!email) {
    console.warn('[Whop Webhook] No email found in payload');
    return res.status(200).json({ received: true, warning: 'No email in payload' });
  }

  const { data: usersData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error('[Whop Webhook] Failed to list users:', userError);
    return res.status(500).json({ error: 'Failed to list users' });
  }

  const user = (usersData?.users || []).find(
    u => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!user) {
    console.warn('[Whop Webhook] No Supabase user found for email:', email);
    return res.status(200).json({ received: true, warning: 'User not found' });
  }

  const userId = user.id;
  console.log('[Whop Webhook] Found user:', userId);

  // Handle both dot and underscore event formats
  const activateEvents = [
    'membership_activated',
    'membership.went_valid',
    'payment_succeeded',
    'payment.succeeded',
  ];

  const deactivateEvents = [
    'membership_deactivated',
    'membership.went_invalid',
    'membership.expired',
    'membership.cancelled',
    'membership_cancel_at_period_end_changed',
  ];

  if (activateEvents.includes(action)) {
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

    console.log('[Whop Webhook] Upgrading user to:', isElitePlan ? 'elite' : 'pro');
    await supabase.from('profiles').upsert([updatePayload], { onConflict: 'user_id' });
    return res.status(200).json({ success: true, plan: isElitePlan ? 'elite' : 'pro' });
  }

  if (deactivateEvents.includes(action)) {
    console.log('[Whop Webhook] Downgrading user to free');
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

  console.log('[Whop Webhook] Unhandled action:', action);
  return res.status(200).json({ received: true, action });
}
