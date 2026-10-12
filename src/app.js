require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { connectDB, mongoose } = require('./db');
const { getStatus, requireOpen } = require('./shopStatus');
const adminAuth = require('./middleware/adminAuth');
const catalogRoutes = require('./routes/catalog');
const quoteRoutes = require('./routes/quote');
const orderRoutes = require('./routes/orders');
const customRoutes = require('./routes/custom');
const { router: authRoutes } = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const pincodeRoutes = require('./routes/pincode');
const imageRoutes = require('./routes/images');
const adminImageRoutes = require('./routes/adminImages');

const app = express();

// Photo uploads carry a compressed image as a data URL; everything else is small.
app.use('/api/admin/products/:id/images', express.json({ limit: '6mb' }));
app.use(express.json({ limit: '1mb' }));

/**
 * Only the shop and the admin may call this API from a browser. Set both
 * origins in Vercel; a missing origin (curl, server-side fetch from Next.js)
 * is allowed through.
 */
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.length === 0 || allowed.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  })
);

/**
 * Service index and liveness.
 *
 * These two sit BEFORE the database middleware on purpose: they are what you
 * reach for when something is wrong, and a status page that goes down with the
 * database tells you nothing you did not already know. They always answer, and
 * they report the database state rather than failing because of it.
 */
const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
const dbState = () => dbStates[mongoose.connection.readyState] || 'unknown';

app.get('/', (_req, res) => {
  res.json({
    service: 'batpod-server',
    description:
      'API and CPQ pricing engine for the Batpod Labs shop. There is no website here \u2014 the shop is a separate deployment.',
    database: dbState(),
    endpoints: {
      health: '/api/health',
      categories: '/api/categories',
      products: '/api/products',
      product: '/api/products/:slug',
      quote: 'POST /api/quote',
      orders: 'POST /api/orders',
      customOptions: '/api/custom/options',
      customEstimate: 'POST /api/custom/estimate',
      status: '/api/status',
      admin: '/api/admin/* (needs an x-admin-key header)',
    },
  });
});

/**
 * Shop status, readable without the database gate so the storefront can tell
 * "closed on purpose" from "the server is unreachable". If the database is
 * down this says so instead of failing, and the storefront shows its own
 * holding page either way.
 */
app.get('/api/status', async (_req, res) => {
  try {
    await connectDB();
    const status = await getStatus();
    res.json({ ...status, reachable: true, database: dbState(), time: new Date().toISOString() });
  } catch (err) {
    res.status(200).json({ mode: 'unreachable', reachable: false, database: dbState(), error: err.message, time: new Date().toISOString() });
  }
});

// Pincode lookups need no database — mounted above the gate so the checkout
// form keeps working even when Atlas is slow.
app.use('/api', pincodeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'batpod-server', database: dbState(), time: new Date().toISOString() });
});

// Every request needs the database; connecting here keeps it out of each route.
app.use(async (_req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection failed:', err.message);
    res.status(503).json({ error: 'Database unavailable. Check MONGODB_URI and the Atlas IP allowlist.' });
  }
});

app.use('/api', catalogRoutes);
app.use('/api', imageRoutes);
// Quotes and orders are refused while the shop is paused or in maintenance.
app.use('/api/quote', requireOpen);
app.use('/api/orders', requireOpen);
app.use('/api', quoteRoutes);
app.use('/api', orderRoutes);
app.use('/api', customRoutes);
app.use('/api', authRoutes);
app.use('/api/admin/products/:id/images', adminAuth, adminImageRoutes);
app.use('/api/admin', adminAuth, adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    return res.status(409).json({ error: `That ${field} is already taken.` });
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(' ') });
  }
  res.status(500).json({ error: err.message || 'Something went wrong.' });
});

module.exports = app;
