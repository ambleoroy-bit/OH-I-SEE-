// ============================================================
// Middleware: JWT Authentication
// ============================================================
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { mergeUserProfile } = require('../services/userProfileStore');

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
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (e) {
      return res.status(401).json({ error: 'Token expired or invalid. Please log in again.' });
    }

    // Fetch fresh user profile from DB
    let profile = null;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', decoded.userId)
        .single();

      if (!error && data) {
        profile = data;
      }
    } catch (e) {
      // DB offline or table missing
    }

    if (!profile || !decoded.userId) {
      return res.status(401).json({ error: 'Your account could not be verified. Please sign in again.' });
    }

    req.user = mergeUserProfile(profile);
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(401).json({ error: 'Authentication required. Please log in again.' });
  }
}

module.exports = { authenticate };
