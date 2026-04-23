import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ error: 'No session provided' });
  }

  const token = authorization.replace('Bearer ', '').trim();
  if (!token || token.length < 10) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    return res.status(200).json({
      authenticated: true,
      userId: user.id
    });

  } catch (err) {
    console.error('Auth check error:', err);
    return res.status(500).json({ error: 'Auth verification failed' });
  }
}
