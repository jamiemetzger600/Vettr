import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import dealsRoutes from './routes/deals.js';
import crmRoutes from './routes/crm.js';
import ddPublicRoutes from './routes/ddPublic.js';
import underwritingPublicRoutes from './routes/underwritingPublic.js';
import paymentsRoutes from './routes/payments.js';
import airtableDealsRoutes from './routes/airtableDeals.js';
import marketDealsRoutes from './routes/marketDeals.js';
import teamsRoutes from './routes/teams.js';
import feedbackRoutes from './routes/feedback.js';
import './services/notificationScheduler.js'; // Start notification jobs
import './services/airtableScraper.js';
import { parseCookieHeader } from './lib/authCookies.js';
import { validateConfig } from './config.js';
import pool from './db/pool.js';
import { runMigrations } from './db/migrate.js';

dotenv.config();
validateConfig(); // Exits in production if required env vars missing (see CONFIG.md)

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Gzip compress all responses — reduces egress by 70-85% on JSON payloads
app.use(compression());

// CORS: use a function so we always send exactly one Access-Control-Allow-Origin value (required by spec)
const webAppUrlRaw = process.env.WEB_APP_URL || 'http://localhost:5173';
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? webAppUrlRaw.split(',').map(s => s.trim()).filter(Boolean).map(url => url.replace(/\/+$/, ''))
  : [webAppUrlRaw, 'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'];
if (process.env.NODE_ENV === 'production') {
  console.log('[cors] Allowed origins:', allowedOrigins.length ? allowedOrigins : '(none – check WEB_APP_URL)');
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) {
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return cb(null, origin);
    }
    if (/^chrome-extension:\/\//i.test(origin)) {
      return cb(null, origin);
    }
    cb(null, false);
  },
  credentials: true
}));

app.use((req, _res, next) => {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
});

// Body parsing (except for Stripe webhooks)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    next();
  } else {
    // 8mb allows feedback screenshot + voice base64 payloads
    express.json({ limit: '8mb' })(req, res, next);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '5.0.104' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/dd/public', ddPublicRoutes);
app.use('/api/underwriting/public', underwritingPublicRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/airtable-deals', airtableDealsRoutes);
app.use('/api/market-deals', marketDealsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  app.listen(PORT, () => {
    console.log(`🚀 Vettr API server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Web app URL: ${process.env.WEB_APP_URL || 'http://localhost:5173'}`);
  });

  try {
    await runMigrations(pool);
  } catch (err) {
    console.error('❌ Startup migrations failed:', err);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

startServer();
