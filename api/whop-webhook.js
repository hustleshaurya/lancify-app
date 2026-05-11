import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const action = body.action || req.headers['x-whop-event'] || body.type || '';
  const data = body.data || body;

  console.log('[Whop Webhook] action:', action);
  console.log('[Whop Webhook] full body keys:', Object.keys(body));
  console.log('[Whop Webhook] data:', JSON.stringify(data).substring(0, 500));

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

  const PRO_MONTHLY_ID   = process.env.WHOP_PRO_MONTHLY_ID;
  const PRO_ANNUAL_ID    = process.env.WHOP_PRO_ANNUAL_ID;
  const ELITE_MONTHLY_ID = process.env.WHOP_ELITE_MONTHLY_ID;
  const ELITE_ANNUAL_ID  = process.env.WHOP_ELITE_ANNUAL_ID;

  // Log env vars (masked) so you can verify they're loaded
  console.log('[Whop Webhook] plan env check:', {
    PRO_MONTHLY_ID:   PRO_MONTHLY_ID   ? PRO_MONTHLY_ID.slice(0, 8) + '...' : 'MISSING',
    PRO_ANNUAL_ID:    PRO_ANNUAL_ID    ? PRO_ANNUAL_ID.slice(0, 8)  + '...' : 'MISSING',
    ELITE_MONTHLY_ID: ELITE_MONTHLY_ID ? ELITE_MONTHLY_ID.slice(0, 8) + '...' : 'MISSING',
    ELITE_ANNUAL_ID:  ELITE_ANNUAL_ID  ? ELITE_ANNUAL_ID.slice(0, 8)  + '...' : 'MISSING',
  });
  console.log('[Whop Webhook] planId from payload:', planId);

  const isProPlan   = [PRO_MONTHLY_ID, PRO_ANNUAL_ID].includes(planId);
  const isElitePlan = [ELITE_MONTHLY_ID, ELITE_ANNUAL_ID].includes(planId);

  console.log('[Whop Webhook] isProPlan:', isProPlan, '| isElitePlan:', isElitePlan);

  if (!email) {
    console.warn('[Whop Webhook] No email found in payload');
    return res.status(200).json({ received: true, warning: 'No email in payload' });
  }

  // FIX: paginate through all users to avoid the 1000-user limit
  let allUsers = [];
  let page = 1;
  while (true) {
    const { data: usersData, error: userError } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (userError) {
      console.error('[Whop Webhook] Failed to list users:', userError);
      return res.status(500).json({ error: 'Failed to list users' });
    }
    const batch = usersData?.users || [];
    allUsers = allUsers.concat(batch);
    if (batch.length < 1000) break;
    page++;
  }

  const user = allUsers.find(
    u => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!user) {
    console.warn('[Whop Webhook] No Supabase user found for email:', email);
    return res.status(200).json({ received: true, warning: 'User not found' });
  }

  const userId = user.id;
  console.log('[Whop Webhook] Found user:', userId);

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
    const tier = isElitePlan ? 'elite' : isProPlan ? 'pro' : 'free';
    const updatePayload = {
      is_pro: isProPlan || isElitePlan,
      is_elite: isElitePlan,
      whop_plan_id: planId,
      plan_activated_at: new Date().toISOString(),
      credits_total: isElitePlan ? 10000 : isProPlan ? 3000 : 200,
      credits_remaining: isElitePlan ? 10000 : isProPlan ? 3000 : 200,
      credits_cycle_start: new Date().toISOString(),
      billing_usage: {},
    };

    console.log('[Whop Webhook] Upgrading user to:', tier, '| payload:', JSON.stringify(updatePayload));

    // FIX: use .update().eq() instead of .upsert() — profile row already exists
    const { data: updateData, error: updateError } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('user_id', userId)
      .select(); // .select() so we can confirm what was written

    if (updateError) {
      console.error('[Whop Webhook] Supabase update FAILED:', JSON.stringify(updateError));
      return res.status(500).json({ error: 'DB update failed', details: updateError });
    }

    console.log('[Whop Webhook] Supabase update SUCCESS:', JSON.stringify(updateData));
    return res.status(200).json({ success: true, plan: tier });
  }

  if (deactivateEvents.includes(action)) {
    console.log('[Whop Webhook] Downgrading user to free');

    const { data: updateData, error: updateError } = await supabase
      .from('profiles')
      .update({
        is_pro: false,
        is_elite: false,
        whop_plan_id: null,
        credits_total: 200,
        credits_remaining: 200,
        credits_cycle_start: new Date().toISOString(),
        billing_usage: {},
      })
      .eq('user_id', userId)
      .select();

    if (updateError) {
      console.error('[Whop Webhook] Supabase downgrade FAILED:', JSON.stringify(updateError));
      return res.status(500).json({ error: 'DB update failed', details: updateError });
    }

    console.log('[Whop Webhook] Supabase downgrade SUCCESS:', JSON.stringify(updateData));
    return res.status(200).json({ success: true, downgraded: true });
  }

  console.log('[Whop Webhook] Unhandled action:', action);
  return res.status(200).json({ received: true, action });
}
