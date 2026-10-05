const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Customer authentication.
 *
 * A signed JWT in an `Authorization: Bearer <token>` header. Separate from the
 * admin key, which protects a different surface entirely — a customer token can
 * never reach /api/admin.
 *
 * The token lives in the browser's localStorage, which means a cross-site
 * scripting bug in the shop would expose it. The alternative, an httpOnly
 * cookie, is the stronger choice but needs the API and the shop on the same
 * site; they are on separate Vercel domains. This is the honest trade for now —
 * revisit it when the two sit under one domain, and keep tokens short-lived
 * until then.
 */
const TOKEN_TTL = process.env.JWT_TTL || '7d';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not configured on the server.');
  if (s.length < 24) throw new Error('JWT_SECRET is too short to be worth having. Use 32+ random characters.');
  return s;
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id), email: user.email }, secret(), { expiresIn: TOKEN_TTL });
}

function readToken(req) {
  const header = req.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Attaches `req.user` when a valid token is present, and does nothing when it
 * is not. Used on routes that work for guests but do more for members —
 * placing an order, for instance.
 */
async function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, secret());
    req.user = await User.findById(payload.sub);
  } catch {
    // An expired or forged token is treated as no token at all. The request
    // still succeeds as a guest rather than failing confusingly.
  }
  next();
}

/** Requires a valid token. Used for anything tied to a specific account. */
async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in to do that.' });

  try {
    const payload = jwt.verify(token, secret());
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'That account no longer exists.' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Your session expired. Sign in again.' });
    if (err.message && err.message.includes('JWT_SECRET')) return res.status(500).json({ error: err.message });
    return res.status(401).json({ error: 'That session is not valid.' });
  }
}

module.exports = { signToken, optionalAuth, requireAuth, TOKEN_TTL };
