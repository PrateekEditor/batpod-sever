/**
 * Recommendation scoring.
 *
 * Pure function, no database. Three signals blended, in the order they become
 * available to a shop that has just launched:
 *
 *   1. Interests picked at signup — works on the very first visit, and is the
 *      only honest signal for a new account.
 *   2. What they have actually bought — the strongest signal, but there is
 *      none of it on day one.
 *   3. What they looked at in this browser — works for logged-out visitors,
 *      and fills the gap between the other two.
 *
 * When none of the three says anything, it falls back to best-sellers, which is
 * what every shop does and is honest about being generic.
 *
 * The weights are deliberately plain integers. They are a judgement, not a
 * trained model, and they should be readable by whoever changes them next.
 */

const WEIGHTS = {
  interestCategory: 4, // they said they care about this range
  orderedCategory: 3, // they have bought from this range before
  sharedTagWithOrdered: 2, // shares a tag with something they bought (per tag, capped at 2)
  recentCategory: 1.5, // they were just browsing this range
  featured: 1,
  inStock: 0.5,
  bestSeller: 0.4, // per unit sold, capped
  soldOut: -2, // still show it, but behind things they can buy
  alreadyOwned: -3, // they bought this exact thing; not a priority to show again
};

function scoreProduct(product, signals) {
  const { interests, orderedCategories, orderedTags, orderedSlugs, recentCategories, salesBySlug } = signals;
  const reasons = [];
  let score = 0;

  if (interests.has(product.categorySlug)) {
    score += WEIGHTS.interestCategory;
    reasons.push('matches your interests');
  }

  if (orderedCategories.has(product.categorySlug)) {
    score += WEIGHTS.orderedCategory;
    reasons.push('from a range you have bought before');
  }

  const shared = (product.tags || []).filter((t) => orderedTags.has(t));
  if (shared.length) {
    score += Math.min(shared.length, 2) * WEIGHTS.sharedTagWithOrdered;
    reasons.push(`similar to ${shared.slice(0, 2).join(' and ')}`);
  }

  if (recentCategories.has(product.categorySlug)) {
    score += WEIGHTS.recentCategory;
    reasons.push('you were just looking at this range');
  }

  if (product.featured) score += WEIGHTS.featured;

  const sold = salesBySlug.get(product.slug) || 0;
  if (sold > 0) {
    score += Math.min(sold * WEIGHTS.bestSeller, 2);
    if (sold >= 3) reasons.push('one of the best sellers');
  }

  const available = product.madeToOrder || product.stockOnHand > 0;
  score += available ? WEIGHTS.inStock : WEIGHTS.soldOut;

  if (orderedSlugs.has(product.slug)) {
    score += WEIGHTS.alreadyOwned;
    reasons.length = 0;
    reasons.push('you have ordered this before');
  }

  return { score, reasons };
}

/**
 * @param {Object}   input
 * @param {Array}    input.products        every active product (plain objects)
 * @param {Object}   [input.user]          { interests: [] } or null for a guest
 * @param {Array}    [input.pastOrders]    the user's orders, each with `lines[{slug}]`
 * @param {Array}    [input.recentSlugs]   recently viewed, newest first
 * @param {Map}      [input.salesBySlug]   slug -> units sold across all orders
 * @param {number}   [input.limit]
 * @param {string[]} [input.excludeSlugs]  never recommend these (e.g. the page you are on)
 */
function recommendProducts({
  products = [],
  user = null,
  pastOrders = [],
  recentSlugs = [],
  salesBySlug = new Map(),
  limit = 6,
  excludeSlugs = [],
} = {}) {
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const interests = new Set((user && user.interests) || []);

  const orderedSlugs = new Set();
  for (const order of pastOrders) {
    for (const line of order.lines || []) if (line.slug) orderedSlugs.add(line.slug);
  }

  const orderedCategories = new Set();
  const orderedTags = new Set();
  for (const slug of orderedSlugs) {
    const p = bySlug.get(slug);
    if (!p) continue;
    orderedCategories.add(p.categorySlug);
    for (const t of p.tags || []) orderedTags.add(t);
  }

  // Only the handful they looked at most recently counts — a product viewed
  // twenty pages ago says very little.
  const recentCategories = new Set();
  for (const slug of recentSlugs.slice(0, 5)) {
    const p = bySlug.get(slug);
    if (p) recentCategories.add(p.categorySlug);
  }

  const signals = { interests, orderedCategories, orderedTags, orderedSlugs, recentCategories, salesBySlug };

  const exclude = new Set([...excludeSlugs, ...recentSlugs.slice(0, 2)]);

  const hasPersonalSignal = interests.size > 0 || orderedSlugs.size > 0 || recentCategories.size > 0;

  const scored = products
    .filter((p) => !exclude.has(p.slug))
    .map((p) => {
      const { score, reasons } = scoreProduct(p, signals);
      return { product: p, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.product.listPrice - b.product.listPrice);

  // Don't let one range fill the whole rail — three keychains is a worse rail
  // than a keychain, a desk piece and a cable clip, even if the keychains score
  // higher individually.
  const perCategory = new Map();
  const picked = [];
  const overflow = [];

  for (const row of scored) {
    const c = row.product.categorySlug;
    const used = perCategory.get(c) || 0;
    if (used < 2) {
      perCategory.set(c, used + 1);
      picked.push(row);
    } else {
      overflow.push(row);
    }
    if (picked.length >= limit) break;
  }

  const final = [...picked, ...overflow].slice(0, limit);

  return {
    personalised: hasPersonalSignal,
    basis: hasPersonalSignal
      ? [
          interests.size ? 'interests' : null,
          orderedSlugs.size ? 'past orders' : null,
          recentCategories.size ? 'recently viewed' : null,
        ].filter(Boolean)
      : ['best sellers'],
    items: final.map((r) => ({
      ...r.product,
      recommendationScore: Math.round(r.score * 10) / 10,
      // The top reason only. A list of five reasons reads as a machine
      // explaining itself rather than a shop making a suggestion.
      reason: r.reasons[0] || null,
    })),
  };
}

module.exports = { recommendProducts, WEIGHTS };
