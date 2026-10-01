/**
 * Pricing engine tests. No database, no framework — run with `npm run test:pricing`.
 * Every number below was worked out by hand first; if the engine disagrees with
 * these, the engine is wrong.
 */
const assert = require('assert');
const { calculateQuote, applyDiscountSchedule } = require('./engine');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
}

const keychain = {
  _id: 'p1',
  sku: 'BP-KEY-001',
  slug: 'dominar-keychain',
  name: 'Dominar Keychain',
  categorySlug: 'biker',
  listPrice: 249,
  tags: ['dominar', 'keyring'],
  images: [],
  discountScheduleId: 's1',
};

const deskModel = {
  _id: 'p2',
  sku: 'BP-DESK-001',
  slug: 'mini-bike-desk-model',
  name: 'Mini Bike Desk Model',
  categorySlug: 'tabletop',
  listPrice: 1499,
  tags: ['desk', 'display'],
  images: [],
  discountScheduleId: null,
};

const rangeSchedule = {
  _id: 's1',
  name: 'Keychain Volume',
  type: 'range',
  active: true,
  tiers: [
    { lowerBound: 1, upperBound: 3, discountPercent: 0 },
    { lowerBound: 3, upperBound: 6, discountPercent: 10 },
    { lowerBound: 6, upperBound: null, discountPercent: 20 },
  ],
};

const slabSchedule = {
  _id: 's1',
  name: 'Keychain Slab',
  type: 'slab',
  active: true,
  tiers: [
    { lowerBound: 1, upperBound: 6, discountPercent: 0 },
    { lowerBound: 6, upperBound: 11, discountPercent: 10 },
    { lowerBound: 11, upperBound: null, discountPercent: 15 },
  ],
};

console.log('\nDiscount schedules');

test('range: 1 unit gets no discount', () => {
  const r = applyDiscountSchedule(rangeSchedule, 249, 1);
  assert.strictEqual(r.discountAmount, 0);
});

test('range: 4 units all get 10%', () => {
  const r = applyDiscountSchedule(rangeSchedule, 249, 4);
  // 249 * 4 = 996, 10% = 99.60
  assert.strictEqual(r.discountAmount, 99.6);
  assert.strictEqual(r.effectivePercent, 10);
});

test('range: 6 units cross into the 20% tier', () => {
  const r = applyDiscountSchedule(rangeSchedule, 249, 6);
  assert.strictEqual(r.discountAmount, 298.8); // 1494 * 20%
});

test('slab: 12 units are priced band by band', () => {
  const r = applyDiscountSchedule(slabSchedule, 100, 12);
  // 5 units @ 0% = 0, 5 units @ 10% of 100 = 50, 2 units @ 15% of 100 = 30
  assert.strictEqual(r.discountAmount, 80);
  assert.strictEqual(r.detail.bands.length, 3);
  assert.deepStrictEqual(
    r.detail.bands.map((b) => b.units),
    [5, 5, 2]
  );
});

test('slab and range differ for the same quantity', () => {
  const slab = applyDiscountSchedule(slabSchedule, 100, 12).discountAmount;
  const range = applyDiscountSchedule({ ...slabSchedule, type: 'range' }, 100, 12).discountAmount;
  assert.strictEqual(range, 180); // all 12 units at 15%
  assert.ok(slab < range, 'slab should discount less than range');
});

test('inactive schedule is ignored', () => {
  const r = applyDiscountSchedule({ ...rangeSchedule, active: false }, 249, 10);
  assert.strictEqual(r.discountAmount, 0);
});

console.log('\nQuote calculation');

test('single line with no rules is just list price', () => {
  const q = calculateQuote({ lines: [{ product: deskModel, quantity: 1 }] });
  assert.strictEqual(q.subtotal, 1499);
  assert.strictEqual(q.totalSaved, 0);
});

test('volume tier flows through to the quote', () => {
  const q = calculateQuote({
    lines: [{ product: keychain, quantity: 4 }],
    schedules: [rangeSchedule],
  });
  assert.strictEqual(q.grossSubtotal, 996);
  assert.strictEqual(q.subtotal, 896); // 996 - 99.60 rounded
  assert.strictEqual(q.lines[0].adjustments.length, 1);
});

test('line rule on a category applies', () => {
  const rule = {
    _id: 'r1',
    name: 'Biker launch 15%',
    scope: 'line',
    active: true,
    priority: 10,
    conditionLogic: 'all',
    conditions: [{ field: 'categorySlug', operator: 'equals', value: 'biker' }],
    actions: [{ type: 'percentDiscount', value: 15, label: 'Launch offer' }],
  };
  const q = calculateQuote({ lines: [{ product: keychain, quantity: 1 }], rules: [rule] });
  assert.strictEqual(q.subtotal, 212); // 249 - 15% = 211.65 -> 212
  assert.strictEqual(q.lines[0].adjustments[0].label, 'Launch offer');
});

test('a rule whose condition fails does nothing', () => {
  const rule = {
    _id: 'r1',
    name: 'Tabletop only',
    scope: 'line',
    active: true,
    priority: 10,
    conditionLogic: 'all',
    conditions: [{ field: 'categorySlug', operator: 'equals', value: 'tabletop' }],
    actions: [{ type: 'percentDiscount', value: 50 }],
  };
  const q = calculateQuote({ lines: [{ product: keychain, quantity: 1 }], rules: [rule] });
  assert.strictEqual(q.subtotal, 249);
});

test('stopProcessing halts later rules', () => {
  const rules = [
    {
      _id: 'r1',
      name: 'First 10%',
      scope: 'line',
      active: true,
      priority: 1,
      conditionLogic: 'all',
      conditions: [],
      actions: [{ type: 'percentDiscount', value: 10 }],
      stopProcessing: true,
    },
    {
      _id: 'r2',
      name: 'Second 50%',
      scope: 'line',
      active: true,
      priority: 2,
      conditionLogic: 'all',
      conditions: [],
      actions: [{ type: 'percentDiscount', value: 50 }],
    },
  ];
  const q = calculateQuote({ lines: [{ product: deskModel, quantity: 1 }], rules });
  assert.strictEqual(q.subtotal, 1349); // 1499 - 10% only
});

test('order rule fires on subtotal threshold', () => {
  const rule = {
    _id: 'r3',
    name: 'Spend 1400 get 100 off',
    scope: 'order',
    active: true,
    priority: 10,
    conditionLogic: 'all',
    conditions: [{ field: 'subtotal', operator: 'greaterOrEqual', value: 1400 }],
    actions: [{ type: 'amountDiscount', value: 100, label: 'Bulk order' }],
  };
  const q = calculateQuote({ lines: [{ product: deskModel, quantity: 1 }], rules: [rule] });
  assert.strictEqual(q.subtotal, 1399);
  assert.strictEqual(q.orderAdjustments[0].amount, -100);
});

test('free shipping rule zeroes the shipping fee', () => {
  const rule = {
    _id: 'r4',
    name: 'Free ship over 999',
    scope: 'order',
    active: true,
    priority: 10,
    conditionLogic: 'all',
    conditions: [{ field: 'subtotal', operator: 'greaterThan', value: 999 }],
    actions: [{ type: 'freeShipping', value: 0, label: 'Free shipping' }],
  };
  const q = calculateQuote({ lines: [{ product: deskModel, quantity: 1 }], rules: [rule], shippingFee: 60 });
  assert.strictEqual(q.shipping, 0);
  assert.strictEqual(q.total, 1499);
});

test('coupon applies after every rule', () => {
  const coupon = {
    code: 'BATPOD10',
    discountType: 'percent',
    value: 10,
    minSubtotal: 0,
    maxDiscount: null,
    isRedeemable: () => ({ ok: true }),
  };
  const q = calculateQuote({ lines: [{ product: deskModel, quantity: 1 }], coupon });
  assert.strictEqual(q.coupon.applied, true);
  assert.strictEqual(q.subtotal, 1349);
});

test('coupon maxDiscount caps the benefit', () => {
  const coupon = {
    code: 'BIG',
    discountType: 'percent',
    value: 50,
    minSubtotal: 0,
    maxDiscount: 200,
    isRedeemable: () => ({ ok: true }),
  };
  const q = calculateQuote({ lines: [{ product: deskModel, quantity: 1 }], coupon });
  assert.strictEqual(q.coupon.amount, 200);
  assert.strictEqual(q.subtotal, 1299);
});

test('rejected coupon leaves the total alone and explains why', () => {
  const coupon = {
    code: 'MIN2000',
    discountType: 'percent',
    value: 10,
    minSubtotal: 2000,
    isRedeemable: () => ({ ok: false, reason: 'Add more to use this code.' }),
  };
  const q = calculateQuote({ lines: [{ product: deskModel, quantity: 1 }], coupon });
  assert.strictEqual(q.coupon.applied, false);
  assert.strictEqual(q.subtotal, 1499);
  assert.ok(q.coupon.reason);
});

test('a discount can never push a line below zero', () => {
  const rule = {
    _id: 'r9',
    name: 'Silly 200% off',
    scope: 'line',
    active: true,
    priority: 1,
    conditionLogic: 'all',
    conditions: [],
    actions: [{ type: 'amountDiscount', value: 99999 }],
  };
  const q = calculateQuote({ lines: [{ product: keychain, quantity: 1 }], rules: [rule] });
  assert.strictEqual(q.subtotal, 0);
});

test('expired rule does not fire', () => {
  const rule = {
    _id: 'r10',
    name: 'Diwali 2024',
    scope: 'line',
    active: true,
    priority: 1,
    conditionLogic: 'all',
    conditions: [],
    actions: [{ type: 'percentDiscount', value: 90 }],
    endsAt: new Date('2024-11-30'),
  };
  const q = calculateQuote({ lines: [{ product: deskModel, quantity: 1 }], rules: [rule] });
  assert.strictEqual(q.subtotal, 1499);
});

test('mixed cart totals correctly', () => {
  const q = calculateQuote({
    lines: [
      { product: keychain, quantity: 6 },
      { product: deskModel, quantity: 1 },
    ],
    schedules: [rangeSchedule],
  });
  // keychain: 249*6 = 1494, less 20% = 1195.20 -> 1195
  // desk: 1499
  assert.strictEqual(q.lines[0].netLineTotal, 1195);
  assert.strictEqual(q.subtotal, 2694);
});

console.log(`\n${passed} checks passed\n`);
