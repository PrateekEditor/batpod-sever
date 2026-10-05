const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const { optionalAuth } = require('../middleware/auth');
const { recommendProducts } = require('../recommend');

const router = express.Router();

/**
 * Related-product scoring. This is what keeps someone moving from one product
 * to the next instead of leaving after the first page.
 *
 *   same category        +3
 *   each shared tag      +2  (capped at 3 tags so one over-tagged product
 *                             cannot dominate every result)
 *   price within 40%     +1  (a 249 keychain should not suggest a 1499 model)
 *   featured             +0.5
 *
 * Ties break toward in-stock items, because suggesting something sold out
 * wastes the slot.
 */
function scoreRelated(base, candidate) {
  let score = 0;
  if (candidate.categorySlug === base.categorySlug) score += 3;

  const baseTags = new Set(base.tags || []);
  const shared = (candidate.tags || []).filter((t) => baseTags.has(t));
  score += Math.min(shared.length, 3) * 2;

  if (base.listPrice > 0) {
    const ratio = Math.abs(candidate.listPrice - base.listPrice) / base.listPrice;
    if (ratio <= 0.4) score += 1;
  }

  if (candidate.featured) score += 0.5;
  if (candidate.stockOnHand > 0 || candidate.madeToOrder) score += 0.25;

  return score;
}

// GET /api/categories
router.get('/categories', async (_req, res, next) => {
  try {
    const categories = await Category.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
    const counts = await Product.aggregate([
      { $match: { active: true } },
      { $group: { _id: '$categorySlug', count: { $sum: 1 } } },
    ]);
    const countBySlug = Object.fromEntries(counts.map((c) => [c._id, c.count]));
    res.json(categories.map((c) => ({ ...c, productCount: countBySlug[c.slug] || 0 })));
  } catch (err) {
    next(err);
  }
});

// GET /api/products?category=&tag=&q=&sort=&limit=&page=
router.get('/products', async (req, res, next) => {
  try {
    const { category, tag, q, sort = 'curated', limit = 24, page = 1 } = req.query;
    const filter = { active: true };
    if (category) filter.categorySlug = String(category).toLowerCase();
    if (tag) filter.tags = String(tag).toLowerCase();
    if (q) filter.$text = { $search: String(q) };

    const sortMap = {
      curated: { featured: -1, sortOrder: 1, createdAt: -1 },
      priceAsc: { listPrice: 1 },
      priceDesc: { listPrice: -1 },
      newest: { createdAt: -1 },
    };

    const perPage = Math.min(parseInt(limit, 10) || 24, 60);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * perPage;

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sortMap[sort] || sortMap.curated).skip(skip).limit(perPage).lean({ virtuals: true }),
      Product.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), perPage });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:slug  — product plus its related rail in one round trip
router.get('/products/:slug', async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug.toLowerCase(), active: true }).lean({ virtuals: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const pool = await Product.find({ active: true, _id: { $ne: product._id } }).lean({ virtuals: true });

    const related = pool
      .map((p) => ({ product: p, score: scoreRelated(product, p) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((r) => r.product);

    // "Finish the set" — something from a different category, so the customer
    // discovers the other two ranges instead of staying in one aisle.
    const crossSell = pool
      .filter((p) => p.categorySlug !== product.categorySlug)
      .sort((a, b) => (b.featured === true) - (a.featured === true) || a.listPrice - b.listPrice)
      .slice(0, 3);

    res.json({ product, related, crossSell });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/by-slugs  — used by the cart and the recently-viewed rail
router.post('/products/by-slugs', async (req, res, next) => {
  try {
    const slugs = Array.isArray(req.body.slugs) ? req.body.slugs.map((s) => String(s).toLowerCase()) : [];
    if (slugs.length === 0) return res.json([]);
    const items = await Product.find({ slug: { $in: slugs }, active: true }).lean({ virtuals: true });
    // preserve the order the caller asked for
    const bySlug = new Map(items.map((i) => [i.slug, i]));
    res.json(slugs.map((s) => bySlug.get(s)).filter(Boolean));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recommendations?recent=slug,slug&limit=6&exclude=slug
 *
 * Blends what they told us at signup, what they have bought, and what they
 * have just been looking at. Works signed out — recently-viewed comes from the
 * browser and is passed in the query string, so no account is needed for the
 * rail to be useful.
 *
 * The response says which signals it used, and the storefront shows that,
 * because "recommended for you" with no explanation is just a shelf.
 */
router.get('/recommendations', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 6, 12);
    const recentSlugs = String(req.query.recent || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
    const excludeSlugs = String(req.query.exclude || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const [products, pastOrders, salesRows] = await Promise.all([
      Product.find({ active: true }).lean({ virtuals: true }),
      req.user
        ? Order.find({ user: req.user._id, status: { $ne: 'cancelled' } }).select('lines.slug').lean()
        : Promise.resolve([]),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'draft'] } } },
        { $unwind: '$lines' },
        { $group: { _id: '$lines.slug', units: { $sum: '$lines.quantity' } } },
      ]),
    ]);

    const salesBySlug = new Map(salesRows.map((r) => [r._id, r.units]));

    res.json(
      recommendProducts({
        products,
        user: req.user ? { interests: req.user.interests } : null,
        pastOrders,
        recentSlugs,
        salesBySlug,
        limit,
        excludeSlugs,
      })
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.scoreRelated = scoreRelated;
