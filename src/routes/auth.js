const express = require('express');
const User = require('../models/User');
const Order = require('../models/Order');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const VALID_INTERESTS = ['biker', 'tabletop', 'daily'];

function cleanInterests(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((i) => VALID_INTERESTS.includes(i)))];
}

/**
 * POST /api/auth/signup
 *
 * Deliberately asks for almost nothing: email, password, and which ranges they
 * care about. Every extra field here costs sign-ups, and the interests are the
 * one thing that makes the account immediately useful to them.
 */
router.post('/auth/signup', async (req, res, next) => {
  try {
    const { email, password, name = '', interests = [] } = req.body || {};

    if (!email || !password) return res.status(400).json({ error: 'Email and password are both needed.' });
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Use at least 8 characters. Length beats cleverness.' });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'There is already an account with that email. Try signing in.' });
    }

    const user = await User.create({
      email: String(email).toLowerCase().trim(),
      passwordHash: await User.hashPassword(String(password)),
      name: String(name).trim(),
      interests: cleanInterests(interests),
      lastLoginAt: new Date(),
    });

    res.status(201).json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 *
 * The same message whether the email is unknown or the password is wrong.
 * Saying "no account with that email" tells an attacker which addresses are
 * registered, which is a free list of targets.
 */
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are both needed.' });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');
    const ok = user ? await user.verifyPassword(String(password)) : false;

    if (!ok) return res.status(401).json({ error: 'Those details do not match an account.' });

    user.lastLoginAt = new Date();
    await user.save();

    res.json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me — who the current token belongs to. */
router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

/** PATCH /api/auth/me — name, phone, address and interests. Not the email or password. */
router.patch('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const { name, phone, address, interests } = req.body || {};
    if (name !== undefined) req.user.name = String(name).trim();
    if (phone !== undefined) req.user.phone = String(phone).trim();
    if (address !== undefined) {
      req.user.address = {
        line1: String(address.line1 || ''),
        city: String(address.city || ''),
        pincode: String(address.pincode || ''),
      };
    }
    if (interests !== undefined) req.user.interests = cleanInterests(interests);

    await req.user.save();
    res.json({ user: req.user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/orders — this account's order history. */
router.get('/auth/orders', requireAuth, async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
