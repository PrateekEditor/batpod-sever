require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { connectDB } = require('./db');
const adminAuth = require('./middleware/adminAuth');
const catalogRoutes = require('./routes/catalog');
const quoteRoutes = require('./routes/quote');
const orderRoutes = require('./routes/orders');
const customRoutes = require('./routes/custom');
const adminRoutes = require('./routes/admin');

const app = express();

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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'batpod-server', time: new Date().toISOString() });
});

app.use('/api', catalogRoutes);
app.use('/api', quoteRoutes);
app.use('/api', orderRoutes);
app.use('/api', customRoutes);
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
