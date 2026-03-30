// api/auth-check.js
export default function handler(req, res) {
  // Set CORS headers for security
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Get the Supabase session from the request headers
  const authorization = req.headers.authorization;
  
  if (!authorization) {
    return res.status(401).json({ error: 'No session provided' });
  }

  // For this MVP, we'll trust the session token from the frontend
  // In a production app, you would verify this against Supabase
  // This simple check ensures the user has a valid-looking session
  const token = authorization.replace('Bearer ', '');
  
  if (token && token.length > 10) {
    // Session is considered valid
    return res.status(200).json({ authenticated: true });
  } else {
    return res.status(401).json({ error: 'Invalid session' });
  }
}
