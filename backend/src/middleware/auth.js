// ============================================================
// Middleware: JWT Authentication
// ============================================================
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    // Verify our own JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token expired or invalid. Please log in again.' });
    }

    // Fetch fresh user profile from DB
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !profile) {
      return res.status(401).json({ error: 'User not found. Please log in again.' });
    }

    req.user = profile;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = { authenticate };
