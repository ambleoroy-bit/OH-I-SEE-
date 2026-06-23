// ============================================================
// Middleware: Rate Limiting
// ============================================================
const rateLimit = require('express-rate-limit');

// Strict limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { authLimiter, apiLimiter };
