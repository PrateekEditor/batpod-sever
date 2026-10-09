/**
 * Runs the real seed catalog through the real pricing engine, so the prices a
 * customer would actually see are checked — not just the engine in isolation.
 *
 *   npm run test:catalog
 *
 * No database needed. If you change a price, a tier or a rule in seed-data.js
 * and a number below moves, that is the point: update it deliberately.
 */
const assert = require('assert');
const { calculateQuote } = require('./engine');
const { categories, products, schedules, rules } = require('../seed-data');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

// Give the fixtures the ids the database would assign, and attach the volume
// schedule to kit-eligible products exactly as seed.js does.
const SMALL = { ...schedules[0], _id: 'sched-small' };
const BULK = { ...schedules[1], _id: 'sched-bulk' };
const SCHEDULES = [SMALL, BULK];
const RULES = rules.map((r, i) => ({ ...r, _id: `rule-${i}` }));

const catalog = Object.fromEntries(
  products.map((p) => [p.slug, { ...p, _id: p.sku, discountScheduleId: p.kitEligible ? SMALL._id : null }])
);

const quote = (lines, extra = {}) =>
  calculateQuote({ lines, schedules: SCHEDULES, rules: RULES, shippingFee: 60, ...extra });

console.log('\nSeeded catalog pricing');

test('every seeded product has a price and a category', () => {
  for (const p of products) {
    assert.ok(p.listPrice > 0, `${p.sku} has no price`);
    assert.ok(categories.some((c) => c.slug === p.categorySlug), `${p.sku} has a bad category`);
  }
});

test('every SKU and slug is unique', () => {
  assert.strictEqual(new Set(products.map((p) => p.sku)).size, products.length);
  assert.strictEqual(new Set(products.map((p) => p.slug)).size, products.length);
});

test('one keychain: 249 less the 10% launch rule', () => {
  const q = quote([{ product: catalog['dominar-silhouette-keychain'], quantity: 1 }]);
  assert.strictEqual(q.subtotal, 224); // 249 - 24.90
  assert.strictEqual(q.shipping, 60, 'under 999 still pays shipping');
});

test('six keychains: volume tier then launch rule, and shipping goes free', () => {
  const q = quote([{ product: catalog['dominar-silhouette-keychain'], quantity: 6 }]);
  // 1494 gross, -20% volume = 1195.20, -10% launch = 1075.68 -> 1076
  assert.strictEqual(q.grossSubtotal, 1494);
  assert.strictEqual(q.subtotal, 1076);
  assert.strictEqual(q.shipping, 0);
  assert.strictEqual(q.lines[0].adjustments.length, 2, 'both the schedule and the rule should show');
});

test('the volume schedule does not touch non-kit products', () => {
  const q = quote([{ product: catalog['mini-bike-desk-model'], quantity: 6 }]);
  assert.strictEqual(q.lines[0].savedAmount, 0);
});

test('a three-line basket earns the mixed-basket 5%', () => {
  const q = quote([
    { product: catalog['dominar-silhouette-keychain'], quantity: 1 },
    { product: catalog['articulated-flexi-dragon'], quantity: 1 },
    { product: catalog['cable-clip-set-six'], quantity: 1 },
  ]);
  const mixed = q.orderAdjustments.find((a) => a.label === 'Mixed basket');
  assert.ok(mixed, 'mixed basket rule should fire on 3 lines');
  // 224 + 699 + 199 = 1122, less 5% = 1065.9 -> 1066
  assert.strictEqual(q.subtotal, 1066);
  assert.strictEqual(q.shipping, 0);
});

test('a two-line basket does not', () => {
  const q = quote([
    { product: catalog['articulated-flexi-dragon'], quantity: 1 },
    { product: catalog['cable-clip-set-six'], quantity: 1 },
  ]);
  assert.ok(!q.orderAdjustments.some((a) => a.label === 'Mixed basket'));
});

test('the launch rule only touches the biker range', () => {
  const biker = quote([{ product: catalog['matte-helmet-wall-hook'], quantity: 1 }]);
  const daily = quote([{ product: catalog['under-desk-headphone-hook'], quantity: 1 }]);
  assert.strictEqual(biker.subtotal, 539); // 599 - 10%
  assert.strictEqual(daily.subtotal, 249); // untouched
});

test('a bike-meet bulk order of 40 keychains lands in the right place', () => {
  const bulk = { ...catalog['dominar-silhouette-keychain'], discountScheduleId: BULK._id };
  const q = quote([{ product: bulk, quantity: 40 }]);
  // 9960 gross. Slab: 10 @ 0%, 15 @ 10% (373.50), 15 @ 18% (672.30) = 1045.80 off
  // 8914.20, then launch rule -10% = 8022.78 -> 8023
  assert.strictEqual(q.grossSubtotal, 9960);
  assert.strictEqual(q.subtotal, 8023);
  const perUnit = q.lines[0].netUnitPrice;
  assert.ok(perUnit > 180 && perUnit < 220, `per-unit ${perUnit} should sit around 200`);
});

test('no product can ever be quoted below zero', () => {
  for (const slug of Object.keys(catalog)) {
    const q = quote([{ product: catalog[slug], quantity: 1 }]);
    assert.ok(q.subtotal >= 0, `${slug} went negative`);
    assert.ok(q.total >= 0, `${slug} total went negative`);
  }
});

test('margin sanity: nothing sells below its filament cost', () => {
  const FILAMENT_PER_GRAM = 1.2;
  for (const slug of Object.keys(catalog)) {
    const p = catalog[slug];
    const q = quote([{ product: p, quantity: 1 }]);
    const material = (p.filamentGrams || 0) * FILAMENT_PER_GRAM;
    assert.ok(
      q.lines[0].netUnitPrice > material,
      `${p.sku} nets ${q.lines[0].netUnitPrice} but costs ${material.toFixed(0)} in filament alone`
    );
  }
});

console.log(`\n${passed} checks passed\n`);
