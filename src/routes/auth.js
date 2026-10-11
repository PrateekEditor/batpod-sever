const express = require('express');
const User = require('../models/User');
const Order = require('../models/Order');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const { rateLimit } = require('../middleware/rateLimit');
const Coupon = require('../models/Coupon');

const VALID_INTERESTS = ['biker', 'tabletop', 'daily', 'minis'];
const VALID_USES = ['desk', 'home', 'gifting', 'collecting', 'workshop', 'events'];
const CONSENT_VERSION = '2026-10';

function cleanInterests(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((i) => VALID_INTERESTS.includes(i)))];
}

function cleanProfile(raw = {}) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    rides: ['commute', 'tour', 'sport', 'no'].includes(p.rides) ? p.rides : '',
    bikeModel: String(p.bikeModel || '').trim().slice(0, 60),
    useFor: Array.isArray(p.useFor) ? [...new Set(p.useFor.filter((u) => VALID_USES.includes(u)))] : [],
    contactPref: ['whatsapp', 'email', 'none'].includes(p.contactPref) ? p.contactPref : '',
    offersOptIn: Boolean(p.offersOptIn),
  };
}

function cleanConsent(raw = {}) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return { marketing: Boolean(c.marketing), personalisation: Boolean(c.personalisation), at: new Date(), version: CONSENT_VERSION };
}

/**
 * Password rules that help rather than annoy: length is what matters, plus a
 * refusal of the handful of passwords that appear in every breach list and of
 * the email itself. No symbol requirements - they produce "Password1!".
 */
const COMMON = new Set(['password', 'password1', '12345678', '123456789', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'batpod123', 'letmein1']);
function passwordProblem(password, email) {
  const p = String(password || '');
  if (p.length < 8) return 'Use at least 8 characters. Length beats cleverness.';
  if (p.length > 128) return 'That is longer than we can store. 128 characters is plenty.';
  if (COMMON.has(p.toLowerCase())) return 'That password is on every breach list. Pick something only you would think of.';
  if (email && p.toLowerCase() === String(email).toLowerCase()) return 'Your password should not be your email.';
  return null;
}

/** The welcome offer for a new account that asked for offers. */
async function welcomeOffer() {
  const c = await Coupon.findOne({ code: 'FIRSTRIDE', active: true }).lean();
  if (!c) return null;
  return { code: c.code, text: c.discountType === 'percent' ? `${c.value}% off your first order` : `₹${c.value} off your first order`, minSubtotal: c.minSubtotal };
}

const signupLimit = rateLimit({ max: 10, message: 'Too many sign-ups from this connection. Try again in a few minutes.' });
const loginLimit = rateLimit({ max: 20, message: 'Too many sign-in attempts. Wait a few minutes and try again.' });

/**
 * POST /api/auth/signup
 *
 * Email and password are required; everything else is optional and can be
 * skipped. `website` is a honeypot: a field no person sees, so anything that
 * fills it is a script, and it gets a cheerful 201 with nothing created.
 */
router.post('/auth/signup', signupLimit, async (req, res, next) => {
  try {
    const { email, password, name = '', interests = [], profile, consent, website } = req.body || {};

    if (website) return res.status(201).json({ ok: true });

    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail || !password) return res.status(400).json({ error: 'Email and password are both needed.', field: !cleanEmail ? 'email' : 'password' });
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return res.status(400).json({ error: 'That does not look like an email address.', field: 'email' });
    const problem = passwordProblem(password, cleanEmail);
    if (problem) return res.status(400).json({ error: problem, field: 'password' });

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ error: 'There is already an account with that email. Try signing in.', field: 'email' });
    }

    const user = await User.create({
      email: cleanEmail,
      passwordHash: await User.hashPassword(String(password)),
      name: String(name).trim().slice(0, 80),
      interests: cleanInterests(interests),
      profile: cleanProfile(profile),
      consent: cleanConsent(consent),
      lastLoginAt: new Date(),
    });

    const offer = user.profile.offersOptIn ? await welcomeOffer() : null;
    res.status(201).json({ token: signToken(user), user: user.toPublic(), offer });
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
router.post('/auth/login', loginLimit, async (req, res, next) => {
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
    const { name, phone, address, interests, profile, consent } = req.body || {};
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
    if (profile !== undefined) req.user.profile = cleanProfile(profile);
    if (consent !== undefined) req.user.consent = cleanConsent(consent);

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

/** GET /api/auth/orders/:reference — one of this account's orders, with its history. */
router.get('/auth/orders/:reference', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findOne({ user: req.user._id, reference: String(req.params.reference).toUpperCase() });
    if (!order) return res.status(404).json({ error: 'No order with that reference on this account.' });
    res.json({ ...order.toTracking(), customer: order.customer, couponCode: order.couponCode, totalSaved: order.totalSaved, shipping: order.shipping, grossSubtotal: order.grossSubtotal, lines: order.lines });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, passwordProblem, cleanProfile, cleanConsent };
