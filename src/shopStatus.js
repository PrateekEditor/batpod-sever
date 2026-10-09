const ShopStatus = require('./models/ShopStatus');

/**
 * Current shop status, cached for a few seconds.
 *
 * Every quote and order checks this, and the storefront polls it; reading
 * the document on each of those would be a needless round trip to Atlas.
 * A change from the admin clears the cache on this instance; other
 * instances pick it up within CACHE_MS, which is fine for a switch a human
 * flips a few times a year.
 */
const CACHE_MS = 10000;
let cached = null;
let cachedAt = 0;

const DEFAULTS = { mode: 'open', title: '', message: '', until: null, allowBrowsing: true };

async function getStatus() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const doc = await ShopStatus.findOne({ key: 'shop' }).lean();
  cached = doc ? pick(doc) : { ...DEFAULTS };
  cachedAt = Date.now();
  return cached;
}

async function setStatus(fields) {
  const update = {};
  if (['open', 'paused', 'maintenance'].includes(fields.mode)) update.mode = fields.mode;
  if (typeof fields.title === 'string') update.title = fields.title.slice(0, 120);
  if (typeof fields.message === 'string') update.message = fields.message.slice(0, 600);
  if (fields.until === null || fields.until === '') update.until = null;
  else if (fields.until && !Number.isNaN(new Date(fields.until).getTime())) update.until = new Date(fields.until);
  if (typeof fields.allowBrowsing === 'boolean') update.allowBrowsing = fields.allowBrowsing;
  if (typeof fields.changedBy === 'string') update.changedBy = fields.changedBy.slice(0, 80);

  const doc = await ShopStatus.findOneAndUpdate({ key: 'shop' }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  cached = pick(doc);
  cachedAt = Date.now();
  return cached;
}

function pick(doc) {
  return {
    mode: doc.mode || 'open',
    title: doc.title || '',
    message: doc.message || '',
    until: doc.until || null,
    allowBrowsing: doc.allowBrowsing !== false,
    changedBy: doc.changedBy || '',
    updatedAt: doc.updatedAt || null,
  };
}

/** Refuse quotes and orders while the shop is not open. Browsing is handled by the storefront. */
async function requireOpen(req, res, next) {
  try {
    const s = await getStatus();
    if (s.mode === 'open') return next();
    return res.status(503).json({
      error: s.mode === 'paused' ? 'The shop is paused right now and not taking orders.' : 'The shop is down for maintenance.',
      status: s,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getStatus, setStatus, requireOpen, DEFAULTS };
