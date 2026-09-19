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
const aiRoutes = require('./routes/ai');
const projectRoutes = require('./routes/projects');
const procurementRoutes = require('./routes/procurement');
const subcontractRoutes = require('./routes/subcontract');
const logisticsRoutes = require('./routes/logistics');
const financeRoutes = require('./routes/finance');
const qualityRoutes = require('./routes/quality');
const analyticsRoutes = require('./routes/analytics');
const supplierRoutes = require('./routes/suppliers');
const buildSupplyRoutes = require('./routes/buildSupply');
const construction = require('./routes/construction');
const quotationsRoutes = require('./routes/quotations');
const blueprintRoutes = require('./routes/blueprint');
const bimRoutes = require('./routes/bim');
const geoRoutes = require('./routes/geo');
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
app.post('/api/construction/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), construction.webhook);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Detailed Error Logging Middleware ───────────────────────
app.use((req, res, next) => {
  console.log(`\n[REQ] ${req.method} ${req.path}`);
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body || {}).length) {
    console.log('[BODY] omitted');
  }
  next();
});

// ── Logging ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Rate Limiting ─────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Root — API is not the web app; point browsers to the frontend ──
app.get('/', (req, res) => {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>OH I SEE API</title>
<meta http-equiv="refresh" content="0;url=${frontend}/pages/index.html">
<style>body{font-family:system-ui;background:#0a0a0a;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:420px}
a{color:#FFD400}</style></head><body><div class="box">
<h1>OH I SEE API</h1>
<p>This is the <strong>backend API</strong> (port ${PORT}), not the website.</p>
<p><a href="${frontend}/pages/index.html">Open the app →</a></p>
<p style="font-size:12px;color:#888"><a href="/api/health">API health</a></p>
</div></body></html>`);
  }
  res.json({
    status: 'running',
    server: 'OH I SEE API',
    message: 'This is the backend API. Use the frontend at ' + frontend,
    frontend: `${frontend}/pages/index.html`,
    health: '/api/health',
  });
});

// ── Health Check ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'backend',
    port: PORT,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ── Readiness Check (K8s / load balancers) ───────────────
app.get('/api/ready', async (req, res) => {
  const checks = { supabase: 'skipped' };
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      && !process.env.SUPABASE_URL.includes('placeholder')) {
    try {
      const supabase = require('./config/supabase');
      const { error } = await supabase.from('users').select('id').limit(1);
      checks.supabase = error ? 'degraded' : 'ok';
    } catch {
      checks.supabase = 'degraded';
    }
  }
  const ready = checks.supabase === 'ok' || checks.supabase === 'skipped';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────
app.use('/api/geo',          geoRoutes);
app.use('/api/auth',         authRoutes);
app.use('/api/products',     productRoutes);
app.use('/api/orders',       orderRoutes);
app.use('/api/quotes',       quoteRoutes);
app.use('/api/partners',     partnerRoutes);
app.use('/api/users',        userRoutes);
app.use('/api/ai',           aiRoutes);
app.use('/api/marketplace', require('./routes/marketplace'));
app.use('/api/portal',       require('./routes/portal'));
app.use('/api/projects',     require('./routes/projectSetup'));
app.use('/api/projects',     projectRoutes);
app.use('/api/projects/:projectId/bim', bimRoutes);
app.use('/api/projects/:projectId/home-designs', require('./routes/homeDesign'));
app.use('/api/procurement',  procurementRoutes);
app.use('/api/subcontract',  subcontractRoutes);
app.use('/api/logistics',    logisticsRoutes);
app.use('/api/finance',      financeRoutes);
app.use('/api/quality',      qualityRoutes);
app.use('/api/analytics',    analyticsRoutes);
app.use('/api/suppliers',    supplierRoutes);
app.use('/api/build-supply', buildSupplyRoutes);
app.use('/api/construction', require('./routes/homeRequirements'));
app.use('/api/construction', construction.router);
app.use('/api/quotations',   quotationsRoutes);
app.use('/api/blueprints',   blueprintRoutes);

app.use('/api/3d', require('./routes/design3d').router);

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
  if (process.env.SEED_DEMO_DATA === 'true') await seedProductsIfEmpty();
});

module.exports = app;

