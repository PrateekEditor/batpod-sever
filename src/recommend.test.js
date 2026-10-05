/**
 * Recommendation tests. No database.
 *   npm run test:recommend
 */
const assert = require('assert');
const { recommendProducts } = require('./recommend');
const { products: seedProducts } = require('./seed-data');

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

const products = seedProducts.map((p) => ({ ...p, _id: p.sku }));
const slugs = (r) => r.items.map((i) => i.slug);
const cats = (r) => r.items.map((i) => i.categorySlug);

console.log('\nRecommendations');

test('a guest with no history gets best sellers, honestly labelled', () => {
  const r = recommendProducts({ products, limit: 6 });
  assert.strictEqual(r.personalised, false);
  assert.deepStrictEqual(r.basis, ['best sellers']);
  assert.strictEqual(r.items.length, 6);
});

test('interests picked at signup drive the rail', () => {
  const r = recommendProducts({ products, user: { interests: ['daily'] }, limit: 4 });
  assert.strictEqual(r.personalised, true);
  assert.ok(r.basis.includes('interests'));
  assert.strictEqual(cats(r)[0], 'daily', 'the top pick should be from their chosen range');
  assert.ok(r.items[0].reason.includes('interests'));
});

test('two interests both get represented', () => {
  const r = recommendProducts({ products, user: { interests: ['biker', 'tabletop'] }, limit: 4 });
  const top4 = cats(r);
  assert.ok(top4.includes('biker') && top4.includes('tabletop'));
});

test('past orders pull in the same range and similar tags', () => {
  const r = recommendProducts({
    products,
    pastOrders: [{ lines: [{ slug: 'dominar-silhouette-keychain' }] }],
    limit: 4,
  });
  assert.ok(r.basis.includes('past orders'));
  assert.ok(cats(r).includes('biker'));
});

test('something already bought is pushed down, not hidden', () => {
  const bought = 'articulated-flexi-dragon';
  const r = recommendProducts({ products, pastOrders: [{ lines: [{ slug: bought }] }], limit: 12 });
  const position = slugs(r).indexOf(bought);
  assert.ok(position > 2, `already-owned item should not be near the top, was at ${position}`);
  assert.ok(position !== -1, 'but it should still be reachable');
});

test('recently viewed shapes the rail for a logged-out visitor', () => {
  const r = recommendProducts({ products, recentSlugs: ['hex-dice-tower'], limit: 4 });
  assert.strictEqual(r.personalised, true);
  assert.ok(r.basis.includes('recently viewed'));
  assert.ok(cats(r).includes('tabletop'));
});

test('the two most recently viewed are not recommended back', () => {
  const recent = ['hex-dice-tower', 'articulated-flexi-dragon'];
  const r = recommendProducts({ products, recentSlugs: recent, limit: 8 });
  for (const s of recent) assert.ok(!slugs(r).includes(s), `${s} was just viewed and should not be in the rail`);
});

test('all three signals combine rather than one winning outright', () => {
  const r = recommendProducts({
    products,
    user: { interests: ['daily'] },
    pastOrders: [{ lines: [{ slug: 'matte-helmet-wall-hook' }] }],
    recentSlugs: ['hex-dice-tower'],
    limit: 6,
  });
  assert.deepStrictEqual(r.basis, ['interests', 'past orders', 'recently viewed']);
  const c = new Set(cats(r));
  assert.ok(c.size >= 3, 'a blended rail should not be all one range');
});

test('no single range is allowed to fill the rail', () => {
  const r = recommendProducts({ products, user: { interests: ['biker'] }, limit: 6 });
  const counts = {};
  for (const c of cats(r)) counts[c] = (counts[c] || 0) + 1;
  for (const [c, n] of Object.entries(counts)) {
    assert.ok(n <= 2 || r.items.length <= 2, `${c} appears ${n} times in the first picks`);
  }
});

test('sold-out items rank below things that can be bought', () => {
  const withSoldOut = products.map((p) =>
    p.slug === 'cable-clip-set-six' ? { ...p, stockOnHand: 0, madeToOrder: false } : p
  );
  const r = recommendProducts({ products: withSoldOut, user: { interests: ['daily'] }, limit: 8 });
  const list = slugs(r);
  const soldOutAt = list.indexOf('cable-clip-set-six');
  const inStockAt = list.indexOf('under-desk-headphone-hook');
  assert.ok(soldOutAt > inStockAt, 'a sold-out item should not outrank an available one in the same range');
});

test('best-seller counts lift a product', () => {
  const sales = new Map([['bottle-opener-keyring', 10]]);
  const without = slugs(recommendProducts({ products, limit: 12 })).indexOf('bottle-opener-keyring');
  const with_ = slugs(recommendProducts({ products, salesBySlug: sales, limit: 12 })).indexOf('bottle-opener-keyring');
  assert.ok(with_ < without, `selling well should move it up (${with_} vs ${without})`);
});

test('excludeSlugs keeps the current product out of its own rail', () => {
  const r = recommendProducts({ products, excludeSlugs: ['mini-bike-desk-model'], limit: 12 });
  assert.ok(!slugs(r).includes('mini-bike-desk-model'));
});

test('an empty catalog returns an empty rail rather than throwing', () => {
  const r = recommendProducts({ products: [], user: { interests: ['biker'] } });
  assert.deepStrictEqual(r.items, []);
});

test('unknown slugs in history are ignored, not crashed on', () => {
  const r = recommendProducts({
    products,
    pastOrders: [{ lines: [{ slug: 'a-product-that-was-deleted' }] }],
    recentSlugs: ['also-gone'],
    limit: 4,
  });
  assert.strictEqual(r.items.length, 4);
});

test('the rail never exceeds the requested limit', () => {
  for (const n of [1, 3, 6, 20]) {
    const r = recommendProducts({ products, user: { interests: ['biker', 'daily'] }, limit: n });
    assert.ok(r.items.length <= n);
  }
});

console.log(`\n${passed} checks passed\n`);
