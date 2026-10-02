const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const DiscountSchedule = require('../models/DiscountSchedule');
const PriceRule = require('../models/PriceRule');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const Purchase = require('../models/Purchase');
const QuoteRequest = require('../models/QuoteRequest');
const PartnerKey = require('../models/PartnerKey');
const { calculateQuote } = require('../pricing/engine');
const { unitCost } = require('../pricing/costing');

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
router.use('/purchases', crud(Purchase, { sort: { purchasedOn: -1 }, searchFields: ['name', 'notes'] }));
router.use('/requests', crud(QuoteRequest, { searchFields: ['reference', 'contact.name', 'contact.email'] }));
router.use('/partner-keys', crud(PartnerKey, { searchFields: ['label', 'contactEmail'] }));

/** POST /api/admin/partner-keys/:id — not needed; keys are generated here instead. */
router.post('/generate-key', async (req, res, next) => {
  try {
    const doc = await PartnerKey.create({
      label: req.body.label || 'Unnamed partner',
      contactEmail: req.body.contactEmail || '',
      key: PartnerKey.generate(),
      monthlyLimit: Number(req.body.monthlyLimit) || 1000,
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

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

/**
 * GET /api/admin/payback?assumedMonthlyProfit=&lookbackDays=&hypotheticalCost=
 *
 * Answers "is this worth buying". Works out what the shop actually earns per
 * month — real revenue minus what those products cost to make — and divides
 * each purchase by it.
 *
 * With no order history yet the real figure is zero, which is honest rather
 * than useless: pass `assumedMonthlyProfit` and it models your guess instead,
 * clearly labelled as a guess.
 */
router.get('/payback', async (req, res, next) => {
  try {
    const lookbackDays = Math.max(7, Number(req.query.lookbackDays) || 90);
    const since = new Date(Date.now() - lookbackDays * 86400000);

    const [orders, products, purchases] = await Promise.all([
      Order.find({ status: { $nin: ['cancelled', 'draft'] }, createdAt: { $gte: since } }).lean(),
      Product.find().lean(),
      Purchase.find({ retired: false }).sort({ purchasedOn: -1 }).lean(),
    ]);

    const costBySku = new Map(products.map((p) => [p.sku, unitCost(p)]));

    let revenue = 0;
    let cogs = 0;
    for (const o of orders) {
      revenue += (o.total || 0) - (o.shipping || 0);
      for (const l of o.lines || []) {
        cogs += (costBySku.get(l.sku) || 0) * (l.quantity || 0);
      }
    }

    const months = lookbackDays / 30.44;
    const actualMonthlyProfit = orders.length ? Math.round((revenue - cogs) / months) : 0;

    const assumed = Number(req.query.assumedMonthlyProfit) || 0;
    const usingAssumption = actualMonthlyProfit <= 0 && assumed > 0;
    const grossMonthlyProfit = usingAssumption ? assumed : actualMonthlyProfit;

    // Subscriptions eat into what is left to pay off the one-off purchases.
    const recurringTotal = purchases.reduce((s, p) => s + (p.recurringMonthly || 0), 0);
    const netMonthlyProfit = grossMonthlyProfit - recurringTotal;

    const monthsToCover = (cost) => {
      if (netMonthlyProfit <= 0) return null;
      return Math.round((cost / netMonthlyProfit) * 10) / 10;
    };

    const now = Date.now();
    const rows = purchases.map((p) => {
      const elapsedMonths = Math.max(0, (now - new Date(p.purchasedOn).getTime()) / (30.44 * 86400000));
      const needed = monthsToCover(p.cost);
      const recoveredPercent =
        needed === null ? null : Math.min(100, Math.round((elapsedMonths / needed) * 100));
      const remainingMonths = needed === null ? null : Math.max(0, Math.round((needed - elapsedMonths) * 10) / 10);

      return {
        _id: p._id,
        name: p.name,
        category: p.category,
        cost: p.cost,
        purchasedOn: p.purchasedOn,
        recurringMonthly: p.recurringMonthly || 0,
        expectedMonthlyBenefit: p.expectedMonthlyBenefit || 0,
        monthsToCover: needed,
        elapsedMonths: Math.round(elapsedMonths * 10) / 10,
        remainingMonths,
        recoveredPercent,
        paidBack: recoveredPercent !== null && recoveredPercent >= 100,
      };
    });

    const totalInvested = purchases.reduce((s, p) => s + p.cost, 0);

    res.json({
      basis: {
        lookbackDays,
        orderCount: orders.length,
        revenue: Math.round(revenue),
        estimatedCogs: Math.round(cogs),
        actualMonthlyProfit,
        usingAssumption,
        assumedMonthlyProfit: assumed,
        recurringMonthly: recurringTotal,
        netMonthlyProfit,
      },
      totalInvested,
      totalMonthsToCoverEverything: monthsToCover(totalInvested),
      purchases: rows,
      hypothetical: req.query.hypotheticalCost
        ? {
            cost: Number(req.query.hypotheticalCost),
            monthsToCover: monthsToCover(Number(req.query.hypotheticalCost)),
          }
        : null,
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
