const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const DiscountSchedule = require('../models/DiscountSchedule');
const PriceRule = require('../models/PriceRule');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const { calculateQuote } = require('../pricing/engine');

const router = express.Router();

/** Tiny CRUD factory so six resources don't become six near-identical files. */
function crud(Model, { sort = { createdAt: -1 }, searchFields = [] } = {}) {
  const r = express.Router();

  r.get('/', async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.q && searchFields.length) {
        filter.$or = searchFields.map((f) => ({ [f]: new RegExp(String(req.query.q), 'i') }));
      }
      if (req.query.category) filter.categorySlug = String(req.query.category);
      res.json(await Model.find(filter).sort(sort).limit(500).lean({ virtuals: true }));
    } catch (err) {
      next(err);
    }
  });

  r.get('/:id', async (req, res, next) => {
    try {
      const doc = await Model.findById(req.params.id).lean({ virtuals: true });
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json(doc);
    } catch (err) {
      next(err);
    }
  });

  r.post('/', async (req, res, next) => {
    try {
      const doc = await Model.create(req.body);
      res.status(201).json(doc);
    } catch (err) {
      next(err);
    }
  });

  r.put('/:id', async (req, res, next) => {
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json(doc);
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

router.use('/products', crud(Product, { sort: { sortOrder: 1, name: 1 }, searchFields: ['name', 'sku', 'slug'] }));
router.use('/categories', crud(Category, { sort: { sortOrder: 1 }, searchFields: ['name', 'slug'] }));
router.use('/schedules', crud(DiscountSchedule, { searchFields: ['name'] }));
router.use('/rules', crud(PriceRule, { sort: { priority: 1 }, searchFields: ['name'] }));
router.use('/coupons', crud(Coupon, { searchFields: ['code', 'description'] }));
router.use('/orders', crud(Order, { searchFields: ['reference', 'customer.name', 'customer.phone'] }));

/**
 * PATCH /api/admin/products/:id/stock  — the one action you'll use daily,
 * so it gets its own endpoint rather than a full product update.
 */
router.patch('/stock/:id', async (req, res, next) => {
  try {
    const { stockOnHand, madeToOrder, active } = req.body;
    const update = {};
    if (stockOnHand !== undefined) update.stockOnHand = Math.max(0, Number(stockOnHand));
    if (madeToOrder !== undefined) update.madeToOrder = Boolean(madeToOrder);
    if (active !== undefined) update.active = Boolean(active);

    const doc = await Product.findByIdAndUpdate(req.params.id, update, { new: true }).lean({ virtuals: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/quote-test
 * body: { lines: [{ slug, quantity }], couponCode }
 *
 * The CPQ playground. Same engine the storefront uses, but it returns the full
 * trail so you can see which rule fired and why before you make it live.
 */
router.post('/quote-test', async (req, res, next) => {
  try {
    const rawLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const slugs = rawLines.map((l) => String(l.slug).toLowerCase());
    const products = await Product.find({ slug: { $in: slugs } }).lean();
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    const lines = rawLines
      .map((l) => ({ product: bySlug.get(String(l.slug).toLowerCase()), quantity: l.quantity }))
      .filter((l) => l.product);

    const includeInactive = req.body.includeInactive === true;
    const [schedules, rules] = await Promise.all([
      DiscountSchedule.find(includeInactive ? {} : { active: true }).lean(),
      PriceRule.find(includeInactive ? {} : { active: true }).lean(),
    ]);

    let coupon = null;
    if (req.body.couponCode) coupon = await Coupon.findOne({ code: String(req.body.couponCode).toUpperCase() });

    const quote = calculateQuote({
      lines,
      schedules,
      rules,
      coupon,
      shippingFee: Number(req.body.shippingFee ?? process.env.DEFAULT_SHIPPING_FEE ?? 60),
    });

    res.json({
      quote,
      rulesConsidered: rules.map((r) => ({ id: r._id, name: r.name, scope: r.scope, priority: r.priority, active: r.active })),
      unmatchedSlugs: slugs.filter((s) => !bySlug.has(s)),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/dashboard — the numbers worth seeing on open. */
router.get('/dashboard', async (_req, res, next) => {
  try {
    const [productCount, lowStock, activeRules, activeCoupons, recentOrders, revenue] = await Promise.all([
      Product.countDocuments({ active: true }),
      Product.find({ active: true, madeToOrder: false, stockOnHand: { $lte: 3 } })
        .select('name sku stockOnHand')
        .sort({ stockOnHand: 1 })
        .limit(10)
        .lean(),
      PriceRule.countDocuments({ active: true }),
      Coupon.countDocuments({ active: true }),
      Order.find().sort({ createdAt: -1 }).limit(8).lean(),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'draft'] } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      productCount,
      lowStock,
      activeRules,
      activeCoupons,
      recentOrders,
      revenue: revenue[0] ? revenue[0].total : 0,
      orderCount: revenue[0] ? revenue[0].count : 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
