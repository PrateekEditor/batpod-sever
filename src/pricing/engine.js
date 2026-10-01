/**
 * Batpod CPQ pricing engine.
 *
 * Pure functions — no database, no network. Everything it needs is passed in,
 * which is what makes it testable (see engine.test.js) and lets the admin's
 * quote tester call it through the API without side effects.
 *
 * Calculation order, deliberately the same order Salesforce CPQ uses so the
 * output is explainable:
 *
 *   1. List price            — the product's published MRP
 *   2. Discount schedule     — volume tiers, range or slab
 *   3. Line price rules      — conditions and actions, by priority
 *   4. Line total            — net unit price x quantity
 *   5. Order price rules     — cart-level conditions and actions
 *   6. Coupon                — applied last, on the already-discounted subtotal
 *
 * Every step appends to the line's `adjustments` trail so the admin and the
 * customer can both see exactly where a number came from.
 */

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const rupees = (n) => Math.round(n);

/** Pick the tier a quantity falls into. upperBound is exclusive, null = open-ended. */
function findTier(tiers, quantity) {
  return (
    tiers.find(
      (t) => quantity >= t.lowerBound && (t.upperBound === null || t.upperBound === undefined || quantity < t.upperBound)
    ) || null
  );
}

/**
 * Volume discount. Returns the total discount amount in rupees for the line.
 *
 *  range — one tier applies to every unit
 *  slab  — each tier applies only to the units inside its own band
 */
function applyDiscountSchedule(schedule, unitPrice, quantity) {
  if (!schedule || !schedule.active || !schedule.tiers || schedule.tiers.length === 0) {
    return { discountAmount: 0, effectivePercent: 0, detail: null };
  }

  const tiers = [...schedule.tiers].sort((a, b) => a.lowerBound - b.lowerBound);

  if (schedule.type === 'slab') {
    let discountAmount = 0;
    const bands = [];

    for (const tier of tiers) {
      const bandStart = tier.lowerBound;
      const bandEnd = tier.upperBound === null || tier.upperBound === undefined ? Infinity : tier.upperBound;
      if (quantity < bandStart) break;

      // upperBound is exclusive, so the last unit inside this band is bandEnd - 1.
      const units = Math.max(0, Math.min(quantity, bandEnd - 1) - bandStart + 1);
      if (units <= 0) continue;

      const bandDiscount = unitPrice * units * (tier.discountPercent / 100);
      discountAmount += bandDiscount;
      bands.push({ units, discountPercent: tier.discountPercent, amount: round(bandDiscount) });
    }

    const gross = unitPrice * quantity;
    return {
      discountAmount: round(discountAmount),
      effectivePercent: gross > 0 ? round((discountAmount / gross) * 100) : 0,
      detail: { type: 'slab', scheduleName: schedule.name, bands },
    };
  }

  // range
  const tier = findTier(tiers, quantity);
  if (!tier) return { discountAmount: 0, effectivePercent: 0, detail: null };
  const discountAmount = unitPrice * quantity * (tier.discountPercent / 100);
  return {
    discountAmount: round(discountAmount),
    effectivePercent: tier.discountPercent,
    detail: {
      type: 'range',
      scheduleName: schedule.name,
      tier: { lowerBound: tier.lowerBound, upperBound: tier.upperBound, discountPercent: tier.discountPercent },
    },
  };
}

function compare(actual, operator, expected) {
  const num = (v) => (typeof v === 'number' ? v : parseFloat(v));
  const arr = (v) => (Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()));

  switch (operator) {
    case 'equals':
      return String(actual) === String(expected);
    case 'notEquals':
      return String(actual) !== String(expected);
    case 'greaterThan':
      return num(actual) > num(expected);
    case 'greaterOrEqual':
      return num(actual) >= num(expected);
    case 'lessThan':
      return num(actual) < num(expected);
    case 'lessOrEqual':
      return num(actual) <= num(expected);
    case 'in':
      return arr(expected).map(String).includes(String(actual));
    case 'notIn':
      return !arr(expected).map(String).includes(String(actual));
    case 'contains': {
      // `actual` may be an array (tags, categoriesInCart) or a string.
      if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
      return String(actual ?? '').toLowerCase().includes(String(expected).toLowerCase());
    }
    default:
      return false;
  }
}

function ruleIsLive(rule, now) {
  if (!rule.active) return false;
  if (rule.startsAt && new Date(rule.startsAt) > now) return false;
  if (rule.endsAt && new Date(rule.endsAt) < now) return false;
  return true;
}

function evaluateConditions(rule, context) {
  if (!rule.conditions || rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => compare(context[c.field], c.operator, c.value));
  return rule.conditionLogic === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Main entry point.
 *
 * @param {Object} input
 * @param {Array}  input.lines      [{ product, quantity }] — product is a plain object
 * @param {Array}  input.schedules  DiscountSchedule documents (plain objects)
 * @param {Array}  input.rules      PriceRule documents (plain objects)
 * @param {Object} input.coupon     Coupon document or null
 * @param {Number} input.shippingFee default shipping before any free-shipping rule
 */
function calculateQuote({ lines = [], schedules = [], rules = [], coupon = null, shippingFee = 0 } = {}) {
  const now = new Date();
  const scheduleById = new Map(schedules.map((s) => [String(s._id), s]));
  const liveRules = rules.filter((r) => ruleIsLive(r, now)).sort((a, b) => a.priority - b.priority);
  const lineRules = liveRules.filter((r) => r.scope === 'line');
  const orderRules = liveRules.filter((r) => r.scope === 'order');

  const quoteLines = lines.map(({ product, quantity }) => {
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const listPrice = product.listPrice;
    const adjustments = [];

    // --- Step 2: discount schedule -----------------------------------------
    const schedule = product.discountScheduleId ? scheduleById.get(String(product.discountScheduleId)) : null;
    const vol = applyDiscountSchedule(schedule, listPrice, qty);
    if (vol.discountAmount > 0) {
      adjustments.push({
        source: 'discountSchedule',
        label: `${vol.detail.scheduleName} (${vol.effectivePercent}% on ${qty})`,
        amount: -vol.discountAmount,
        detail: vol.detail,
      });
    }

    let lineTotal = round(listPrice * qty - vol.discountAmount);
    let unitPrice = round(lineTotal / qty);

    // --- Step 3: line price rules ------------------------------------------
    const lineContext = {
      quantity: qty,
      listPrice,
      lineTotal,
      categorySlug: product.categorySlug,
      sku: product.sku,
      tags: product.tags || [],
    };

    for (const rule of lineRules) {
      if (!evaluateConditions(rule, lineContext)) continue;

      for (const action of rule.actions) {
        if (action.type === 'percentDiscount') {
          const amount = round(lineTotal * (action.value / 100));
          lineTotal = round(lineTotal - amount);
          adjustments.push({ source: 'priceRule', label: action.label || rule.name, amount: -amount, ruleId: String(rule._id || '') });
        } else if (action.type === 'amountDiscount') {
          const amount = round(Math.min(action.value * qty, lineTotal));
          lineTotal = round(lineTotal - amount);
          adjustments.push({ source: 'priceRule', label: action.label || rule.name, amount: -amount, ruleId: String(rule._id || '') });
        } else if (action.type === 'setUnitPrice') {
          const newTotal = round(action.value * qty);
          adjustments.push({
            source: 'priceRule',
            label: action.label || rule.name,
            amount: round(newTotal - lineTotal),
            ruleId: String(rule._id || ''),
          });
          lineTotal = newTotal;
        }
      }

      lineContext.lineTotal = lineTotal;
      if (rule.stopProcessing) break;
    }

    lineTotal = Math.max(0, lineTotal);
    unitPrice = qty > 0 ? round(lineTotal / qty) : 0;
    const grossLine = round(listPrice * qty);

    return {
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      categorySlug: product.categorySlug,
      image: (product.images && product.images[0]) || null,
      quantity: qty,
      listPrice: rupees(listPrice),
      grossLineTotal: rupees(grossLine),
      netUnitPrice: rupees(unitPrice),
      netLineTotal: rupees(lineTotal),
      savedAmount: rupees(grossLine - lineTotal),
      savedPercent: grossLine > 0 ? round(((grossLine - lineTotal) / grossLine) * 100) : 0,
      adjustments,
    };
  });

  // --- Step 5: order price rules -------------------------------------------
  let subtotal = quoteLines.reduce((s, l) => s + l.netLineTotal, 0);
  const grossSubtotal = quoteLines.reduce((s, l) => s + l.grossLineTotal, 0);
  const orderAdjustments = [];
  let shipping = shippingFee;

  const orderContext = {
    subtotal,
    itemCount: quoteLines.reduce((s, l) => s + l.quantity, 0),
    lineCount: quoteLines.length,
    categoriesInCart: [...new Set(quoteLines.map((l) => l.categorySlug))],
    couponCode: coupon ? coupon.code : '',
  };

  for (const rule of orderRules) {
    if (!evaluateConditions(rule, orderContext)) continue;

    for (const action of rule.actions) {
      if (action.type === 'percentDiscount') {
        const amount = round(subtotal * (action.value / 100));
        subtotal = round(subtotal - amount);
        orderAdjustments.push({ source: 'priceRule', label: action.label || rule.name, amount: -rupees(amount) });
      } else if (action.type === 'amountDiscount') {
        const amount = round(Math.min(action.value, subtotal));
        subtotal = round(subtotal - amount);
        orderAdjustments.push({ source: 'priceRule', label: action.label || rule.name, amount: -rupees(amount) });
      } else if (action.type === 'freeShipping' && shipping > 0) {
        orderAdjustments.push({ source: 'priceRule', label: action.label || rule.name, amount: -rupees(shipping) });
        shipping = 0;
      }
    }

    orderContext.subtotal = subtotal;
    if (rule.stopProcessing) break;
  }

  // --- Step 6: coupon -------------------------------------------------------
  let couponResult = null;
  if (coupon) {
    const check = typeof coupon.isRedeemable === 'function' ? coupon.isRedeemable(subtotal) : { ok: true };
    if (!check.ok) {
      couponResult = { code: coupon.code, applied: false, reason: check.reason, amount: 0 };
    } else {
      let amount =
        coupon.discountType === 'percent' ? round(subtotal * (coupon.value / 100)) : round(Math.min(coupon.value, subtotal));
      if (coupon.maxDiscount !== null && coupon.maxDiscount !== undefined) {
        amount = Math.min(amount, coupon.maxDiscount);
      }
      amount = round(Math.min(amount, subtotal));
      subtotal = round(subtotal - amount);
      couponResult = { code: coupon.code, applied: true, amount: rupees(amount), description: coupon.description };
      orderAdjustments.push({ source: 'coupon', label: `Coupon ${coupon.code}`, amount: -rupees(amount) });
    }
  }

  const total = rupees(subtotal + shipping);

  return {
    lines: quoteLines,
    grossSubtotal: rupees(grossSubtotal),
    subtotal: rupees(subtotal),
    shipping: rupees(shipping),
    totalSaved: rupees(grossSubtotal - subtotal),
    total,
    orderAdjustments,
    coupon: couponResult,
    calculatedAt: now.toISOString(),
  };
}

module.exports = { calculateQuote, applyDiscountSchedule, evaluateConditions, compare, findTier, round };
