// ============================================================
// OH I SEE — Express API Server
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { apiLimiter } = require('./middleware/rateLimiter');

// Route imports
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const quoteRoutes = require('./routes/quotes');
const partnerRoutes = require('./routes/partners');
const userRoutes = require('./routes/users');
const { seedProductsIfEmpty } = require('./config/seed');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security Headers ──────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ── CORS ─────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', cors());

// ── Request Parsing ───────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Detailed Error Logging Middleware ───────────────────────
app.use((req, res, next) => {
  console.log(`\n[REQ] ${req.method} ${req.path}`);
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body || {}).length) {
    // Clone body to hide passwords in logs
    const safeBody = { ...(req.body || {}) };
    if (safeBody.password) safeBody.password = '***';
    console.log('[BODY]', safeBody);
  }
  next();
});

// ── Logging ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Rate Limiting ─────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Health Check ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    server: 'backend',
    port: PORT,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/quotes',   quoteRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/users',    userRoutes);

// ── 404 Handler ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

// ── Start Server ──────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log(`║  OH I SEE API Server                      ║`);
  console.log(`║  Running on http://localhost:${PORT}         ║`);
  console.log(`║  Environment: ${String(process.env.NODE_ENV || 'dev').padEnd(27)}║`);
  console.log('╚═══════════════════════════════════════════╝\n');
  console.log('✓ Server Running');
  console.log(`✓ Port ${PORT} Active`);
  console.log('✓ Routes Loaded');
  console.log('✓ CORS Enabled');
  console.log('✓ Auth Module Loaded');
  if (process.env.SUPABASE_URL) {
    console.log('✓ Supabase Connected\n');
  } else {
    console.log('⚠ Supabase Configuration Missing\n');
  }
  console.log('  API endpoints:');
  console.log('  POST /api/auth/signup');
  console.log('  POST /api/auth/login');
  console.log('  GET  /api/health');

  // Auto-seed database if empty
  await seedProductsIfEmpty();
});

module.exports = app;
