const express = require('express');
const Product = require('../models/Product');
const DiscountSchedule = require('../models/DiscountSchedule');
const PriceRule = require('../models/PriceRule');
const Coupon = require('../models/Coupon');
const { calculateQuote } = require('../pricing/engine');

const router = express.Router();

const DEFAULT_SHIPPING = Number(process.env.DEFAULT_SHIPPING_FEE || 60);

/**
 * POST /api/quote
 * body: { lines: [{ slug, quantity }], couponCode }
 *
 * The cart never computes its own prices. It sends what the customer picked and
 * the server returns what it costs, with the full adjustment trail. That way the
 * price the customer sees and the price you charge come from the same code.
 */
router.post('/quote', async (req, res, next) => {
  try {
    const rawLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (rawLines.length === 0) {
      return res.json({
        lines: [],
        grossSubtotal: 0,
        subtotal: 0,
        shipping: 0,
        total: 0,
        totalSaved: 0,
        orderAdjustments: [],
        coupon: null,
      });
    }

    const slugs = rawLines.map((l) => String(l.slug).toLowerCase());
    const products = await Product.find({ slug: { $in: slugs }, active: true }).lean();
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    const lines = [];
    const unavailable = [];
    for (const l of rawLines) {
      const product = bySlug.get(String(l.slug).toLowerCase());
      if (!product) {
        unavailable.push(l.slug);
        continue;
      }
      lines.push({ product, quantity: l.quantity });
    }

    const [schedules, rules] = await Promise.all([
      DiscountSchedule.find({ active: true }).lean(),
      PriceRule.find({ active: true }).lean(),
    ]);

    let coupon = null;
    if (req.body.couponCode) {
      const doc = await Coupon.findOne({ code: String(req.body.couponCode).toUpperCase() });
      if (doc) coupon = doc;
      else
        return res.json({
          ...calculateQuote({ lines, schedules, rules, shippingFee: DEFAULT_SHIPPING }),
          coupon: { code: req.body.couponCode, applied: false, reason: 'No such code.', amount: 0 },
          unavailable,
        });
    }

    const quote = calculateQuote({ lines, schedules, rules, coupon, shippingFee: DEFAULT_SHIPPING });
    res.json({ ...quote, unavailable });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
