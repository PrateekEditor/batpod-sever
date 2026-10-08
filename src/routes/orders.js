const express = require('express');
const Product = require('../models/Product');
const DiscountSchedule = require('../models/DiscountSchedule');
const PriceRule = require('../models/PriceRule');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const { calculateQuote } = require('../pricing/engine');
const { optionalAuth } = require('../middleware/auth');
const { SELLABLE } = require('../catalog/ip');

const router = express.Router();
const DEFAULT_SHIPPING = Number(process.env.DEFAULT_SHIPPING_FEE || 60);

/** Anything else in the body is ignored — a customer cannot label their own order "amazon". */
const ALLOWED_CHANNELS = ['website', 'instagram', 'youtube', 'whatsapp', 'bike-meet', 'amazon', 'etsy', 'partner-api', 'other'];

/**
 * POST /api/orders
 *
 * Creates a draft order. Payment is deliberately not wired up yet — the order
 * lands in the admin as `draft` and you take it from there. When you add
 * Razorpay later, the only change is a payment step between the recalculation
 * below and the save.
 *
 * Note the recalculation: prices are never taken from the request body, only
 * recomputed server-side from the slugs and quantities. A client that posts
 * `"total": 1` gets ignored.
 */
router.post('/orders', optionalAuth, async (req, res, next) => {
  try {
    const { customer = {}, lines: rawLines = [], couponCode = '', notes = '', channel, channelDetail = '' } = req.body;

    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      return res.status(400).json({ error: 'An order needs at least one line.' });
    }
    if (!customer.name || !customer.phone) {
      return res.status(400).json({ error: 'Name and phone are required.' });
    }

    const slugs = rawLines.map((l) => String(l.slug).toLowerCase());
    const products = await Product.find({ slug: { $in: slugs }, ...SELLABLE }).lean();
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    const lines = rawLines
      .map((l) => ({ product: bySlug.get(String(l.slug).toLowerCase()), quantity: l.quantity }))
      .filter((l) => l.product);

    if (lines.length === 0) return res.status(400).json({ error: 'None of those products are available.' });

    const [schedules, rules] = await Promise.all([
      DiscountSchedule.find({ active: true }).lean(),
      PriceRule.find({ active: true }).lean(),
    ]);

    let coupon = null;
    if (couponCode) coupon = await Coupon.findOne({ code: String(couponCode).toUpperCase() });

    const quote = calculateQuote({ lines, schedules, rules, coupon, shippingFee: DEFAULT_SHIPPING });

    const order = await Order.create({
      reference: Order.nextReference(),
      status: 'draft',
      // Signed in? Tie the order to the account so it shows in their history.
      user: req.user ? req.user._id : null,
      channel: ALLOWED_CHANNELS.includes(channel) ? channel : 'website',
      channelDetail: String(channelDetail).slice(0, 120),
      customer,
      lines: quote.lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        slug: l.slug,
        quantity: l.quantity,
        listPrice: l.listPrice,
        netUnitPrice: l.netUnitPrice,
        netLineTotal: l.netLineTotal,
        adjustments: l.adjustments,
      })),
      couponCode: quote.coupon && quote.coupon.applied ? quote.coupon.code : '',
      grossSubtotal: quote.grossSubtotal,
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      total: quote.total,
      totalSaved: quote.totalSaved,
      pricingSnapshot: quote,
      notes,
    });

    if (coupon && quote.coupon && quote.coupon.applied) {
      await Coupon.updateOne({ _id: coupon._id }, { $inc: { timesUsed: 1 } });
    }

    res.status(201).json({ reference: order.reference, total: order.total, status: order.status });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:reference — lets a customer look up what they ordered
router.get('/orders/:reference', async (req, res, next) => {
  try {
    const order = await Order.findOne({ reference: req.params.reference.toUpperCase() }).lean();
    if (!order) return res.status(404).json({ error: 'No order with that reference.' });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
