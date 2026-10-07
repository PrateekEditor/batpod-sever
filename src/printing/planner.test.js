/* Plate planner checks. Plain node, no framework — run with `node planner.test.js`. */
const assert = require('assert');
const {
  PRINTERS,
  EDGE_MARGIN,
  PART_GAP,
  HEAT_UP_MINUTES,
  AMS_CHANGE_MINUTES,
  AMS_PURGE_GRAMS,
  orient,
  packPlate,
  plateSummary,
  urgencyScore,
  explodeQueue,
  ordersCleared,
  selectForPlate,
  suggestPlate,
  DEFAULT_PLATE_MINUTES,
} = require('./planner');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
}

const piece = (over = {}) => ({ id: 'p', w: 40, d: 30, h: 20, minutes: 30, grams: 10, colours: ['black'], ...over });

console.log('\nOrientation');

check('a deep narrow part is turned to run wide', () => {
  const o = orient({ w: 20, d: 90 });
  assert.strictEqual(o.w, 90);
  assert.strictEqual(o.d, 20);
  assert.strictEqual(o.rotated, true);
});

check('an already-wide part is left alone', () => {
  const o = orient({ w: 90, d: 20 });
  assert.strictEqual(o.rotated, false);
});

console.log('\nPacking');

check('parts land inside the plate with an edge margin', () => {
  const { placed } = packPlate([piece({ id: 'a' })]);
  const p = placed[0];
  assert.strictEqual(p.x, EDGE_MARGIN);
  assert.strictEqual(p.y, EDGE_MARGIN);
  assert.ok(p.x + p.w <= PRINTERS.a1.bed.x - EDGE_MARGIN);
});

check('neighbours on a shelf are separated by the part gap', () => {
  const { placed } = packPlate([piece({ id: 'a' }), piece({ id: 'b' })]);
  const [a, b] = placed.sort((x, y) => x.x - y.x);
  assert.strictEqual(b.x - (a.x + a.w), PART_GAP);
});

check('nothing overlaps, however many parts are packed', () => {
  const many = Array.from({ length: 24 }, (_, i) => piece({ id: `p${i}`, w: 30 + (i % 5) * 7, d: 25 + (i % 3) * 11 }));
  const { placed } = packPlate(many);
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i];
      const b = placed[j];
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.d <= b.y || b.y + b.d <= a.y;
      assert.ok(apart, `${a.id} overlaps ${b.id}`);
    }
  }
});

check('a part taller than the gantry is refused, not squeezed in', () => {
  const { placed, unplaced } = packPlate([piece({ id: 'tall', h: 400 })]);
  assert.strictEqual(placed.length, 0);
  assert.match(unplaced[0].reason, /bed clears/);
});

check('a part wider than the plate is refused', () => {
  const { unplaced } = packPlate([piece({ id: 'wide', w: 400, d: 400 })]);
  assert.match(unplaced[0].reason, /larger than the plate/);
});

check('a part with no recorded footprint is flagged rather than assumed', () => {
  const { unplaced } = packPlate([piece({ id: 'nodims', w: 0, d: 0 })]);
  assert.match(unplaced[0].reason, /no footprint/);
});

check('the overflow lands in unplaced once the plate is full', () => {
  const big = Array.from({ length: 40 }, (_, i) => piece({ id: `b${i}`, w: 80, d: 80 }));
  const { placed, unplaced } = packPlate(big);
  assert.ok(placed.length > 0);
  assert.ok(unplaced.length > 0);
  assert.strictEqual(placed.length + unplaced.length, big.length);
  assert.ok(unplaced.every((u) => u.reason === 'plate full'));
});

check('the smaller mini bed fits strictly fewer parts than the A1', () => {
  const parts = Array.from({ length: 20 }, (_, i) => piece({ id: `m${i}`, w: 60, d: 60 }));
  const a1 = packPlate(parts, 'a1').placed.length;
  const mini = packPlate(parts, 'a1-mini').placed.length;
  assert.ok(mini < a1, `mini fit ${mini}, a1 fit ${a1}`);
});

check('utilisation is reported as a percentage of the bed', () => {
  const { utilisation } = packPlate([piece({ w: 128, d: 128 })]);
  assert.ok(utilisation > 20 && utilisation < 30, `got ${utilisation}`);
});

console.log('\nTime and filament');

check('an empty plate costs nothing, not a heat-up', () => {
  const s = plateSummary([]);
  assert.strictEqual(s.totalMinutes, 0);
  assert.strictEqual(s.totalGrams, 0);
});

check('one part costs its own time plus the heat-up', () => {
  const s = plateSummary([piece({ minutes: 30 })]);
  assert.strictEqual(s.totalMinutes, 30 + HEAT_UP_MINUTES);
});

check('a single-colour plate never pays a purge', () => {
  const s = plateSummary([piece({ colours: ['black'] }), piece({ colours: ['black'] })]);
  assert.strictEqual(s.colourChanges, 0);
  assert.strictEqual(s.purgeGrams, 0);
});

check('a second colour costs both time and wasted filament', () => {
  const one = plateSummary([piece({ colours: ['black'] })]);
  const two = plateSummary([piece({ colours: ['black'] }), piece({ id: 'b', colours: ['gold'] })]);
  assert.strictEqual(two.colourChanges, 1);
  assert.strictEqual(two.purgeGrams, AMS_PURGE_GRAMS);
  assert.ok(two.totalMinutes >= one.totalMinutes + AMS_CHANGE_MINUTES);
});

check('more parts on a plate add travel time, so the total beats a naive sum', () => {
  const parts = Array.from({ length: 10 }, (_, i) => piece({ id: `t${i}`, minutes: 20 }));
  const s = plateSummary(parts);
  assert.ok(s.totalMinutes > 200 + HEAT_UP_MINUTES, `got ${s.totalMinutes}`);
});

check('needing more colours than the AMS has slots is flagged', () => {
  const parts = ['black', 'gold', 'white', 'red', 'blue'].map((c, i) => piece({ id: `c${i}`, colours: [c] }));
  const s = plateSummary(parts);
  assert.strictEqual(s.amsSlotsNeeded, 5);
  assert.strictEqual(s.overAmsCapacity, true);
});

console.log('\nUrgency');

check('a marketplace order outranks a much older website order', () => {
  const marketplace = urgencyScore({ channel: 'amazon', daysWaiting: 0 });
  const old = urgencyScore({ channel: 'website', daysWaiting: 30 });
  assert.ok(marketplace > old);
});

check('between two website orders the older one wins', () => {
  assert.ok(urgencyScore({ channel: 'website', daysWaiting: 5 }) > urgencyScore({ channel: 'website', daysWaiting: 1 }));
});

check('something already printing is not demoted below a fresh order', () => {
  const started = urgencyScore({ channel: 'website', status: 'printing', daysWaiting: 0 });
  const fresh = urgencyScore({ channel: 'website', status: 'placed', daysWaiting: 0 });
  assert.ok(started > fresh);
});

console.log('\nQueue to plate');

const queue = [
  { orderId: 'o1', reference: 'BP-1001', sku: 'A', name: 'Keychain', quantity: 3, channel: 'amazon', status: 'placed', daysWaiting: 1, footprintMm: { x: 60, y: 25 }, heightMm: 6, printMinutes: 12, filamentGrams: 8, colours: ['black', 'gold'] },
  { orderId: 'o2', reference: 'BP-1002', sku: 'B', name: 'Hook', quantity: 1, channel: 'website', status: 'placed', daysWaiting: 6, footprintMm: { x: 95, y: 70 }, heightMm: 40, printMinutes: 210, filamentGrams: 60, colours: ['black'] },
];

check('a line for three units becomes three pieces on the bed', () => {
  const pieces = explodeQueue(queue);
  assert.strictEqual(pieces.length, 4);
  assert.strictEqual(pieces.filter((p) => p.sku === 'A').length, 3);
});

check('the exploded queue comes back most urgent first', () => {
  const pieces = explodeQueue(queue);
  assert.strictEqual(pieces[0].channel, 'amazon');
});

check('a plate that prints every piece of an order reports it cleared', () => {
  const pieces = explodeQueue(queue);
  const { cleared } = ordersCleared(pieces, pieces);
  assert.strictEqual(cleared.length, 2);
});

check('a plate missing one piece of an order reports it partial, not cleared', () => {
  const pieces = explodeQueue(queue);
  const short = pieces.filter((p) => p.id !== pieces.find((x) => x.sku === 'A').id);
  const { cleared, partial } = ordersCleared(short, pieces);
  assert.ok(partial.some((p) => p.orderId === 'o1'));
  assert.ok(!cleared.some((p) => p.orderId === 'o1'));
});

check('suggestPlate fills a plate and reports what it clears', () => {
  const plate = suggestPlate(queue);
  assert.strictEqual(plate.placed.length, 4);
  assert.strictEqual(plate.queueSize, 4);
  assert.ok(plate.summary.totalMinutes > 0);
  assert.strictEqual(plate.orders.cleared.length, 2);
});

check('a time budget drops work rather than overrunning the evening', () => {
  const plate = suggestPlate(queue, { maxMinutes: 90 });
  assert.ok(plate.summary.totalMinutes <= 90, `got ${plate.summary.totalMinutes}`);
  assert.ok(plate.placed.length < 4);
});

check('a time budget keeps the deadline order and drops the slow one', () => {
  const plate = suggestPlate(queue, { maxMinutes: 90 });
  assert.ok(plate.placed.every((p) => p.sku === 'A'));
});

check('a budget too small for anything returns an empty plate, not a crash', () => {
  const plate = suggestPlate(queue, { maxMinutes: 1 });
  assert.strictEqual(plate.placed.length, 0);
  assert.strictEqual(plate.summary.totalMinutes, 0);
});

check('only: the planner can be pinned to a hand-picked set of pieces', () => {
  const all = explodeQueue(queue);
  const pick = [all[0].id];
  const plate = suggestPlate(queue, { only: pick });
  assert.strictEqual(plate.placed.length, 1);
  assert.strictEqual(plate.placed[0].id, pick[0]);
});

check('an empty queue returns an empty plate rather than throwing', () => {
  const plate = suggestPlate([]);
  assert.strictEqual(plate.placed.length, 0);
  assert.strictEqual(plate.orders.cleared.length, 0);
});


console.log('\nSelection under pressure');

/* A queue bigger than one plate. This is the case that matters: the planner
   has to choose, and the thing it must not do is let the biggest parts win the
   bed just because they pack into tidy rows. */
const pressured = [
  { orderId: 'big', reference: 'BP-BIG', sku: 'TOWER', name: 'Dice tower', quantity: 2, channel: 'website', status: 'placed', daysWaiting: 0,
    footprintMm: { x: 92, y: 80 }, heightMm: 165, printMinutes: 360, filamentGrams: 95, colours: ['matte-black'] },
  { orderId: 'rush', reference: 'BP-RUSH', sku: 'KEY', name: 'Keychain', quantity: 4, channel: 'amazon', status: 'placed', daysWaiting: 0,
    footprintMm: { x: 72, y: 30 }, heightMm: 5, printMinutes: 35, filamentGrams: 18, colours: ['matte-black'] },
];

check('urgent small work gets on the plate ahead of bulky slow work', () => {
  const plate = suggestPlate(pressured);
  const keys = plate.placed.filter((p) => p.sku === 'KEY').length;
  assert.strictEqual(keys, 4, `expected all 4 keychains, got ${keys}`);
});

check('the default plate is one overnight run, not a two-day job', () => {
  const plate = suggestPlate(pressured);
  assert.ok(plate.summary.totalMinutes <= DEFAULT_PLATE_MINUTES, `got ${plate.summary.totalMinutes}`);
});

check('the cap can be lifted deliberately', () => {
  const capped = suggestPlate(pressured);
  const uncapped = suggestPlate(pressured, { maxMinutes: null });
  assert.ok(uncapped.summary.totalMinutes >= capped.summary.totalMinutes);
});

check('a rejected bulky part does not block smaller parts behind it', () => {
  const queue = [
    { orderId: 'a', reference: 'A', sku: 'HUGE', name: 'Huge', quantity: 1, channel: 'amazon', status: 'placed', daysWaiting: 9,
      footprintMm: { x: 240, y: 240 }, heightMm: 20, printMinutes: 900, filamentGrams: 400, colours: ['matte-black'] },
    { orderId: 'b', reference: 'B', sku: 'SMALL', name: 'Small', quantity: 1, channel: 'amazon', status: 'placed', daysWaiting: 8,
      footprintMm: { x: 40, y: 30 }, heightMm: 8, printMinutes: 20, filamentGrams: 10, colours: ['matte-black'] },
  ];
  const plate = suggestPlate(queue);
  assert.ok(plate.placed.some((p) => p.sku === 'SMALL'), 'the small part should still get on');
});

check('the suggestion never exceeds the AMS slot count', () => {
  const manyColours = ['black', 'gold', 'white', 'red', 'blue', 'teal'].map((c, i) => ({
    orderId: `o${i}`, reference: `R${i}`, sku: `S${i}`, name: c, quantity: 1, channel: 'website', status: 'placed', daysWaiting: i,
    footprintMm: { x: 40, y: 30 }, heightMm: 8, printMinutes: 20, filamentGrams: 10, colours: [c],
  }));
  const plate = suggestPlate(manyColours);
  assert.ok(plate.summary.amsSlotsNeeded <= 4, `needed ${plate.summary.amsSlotsNeeded} slots`);
  assert.strictEqual(plate.summary.overAmsCapacity, false);
});

check('respectAms can be turned off when you intend to swap a spool', () => {
  const manyColours = ['black', 'gold', 'white', 'red', 'blue'].map((c, i) => ({
    orderId: `o${i}`, reference: `R${i}`, sku: `S${i}`, name: c, quantity: 1, channel: 'website', status: 'placed', daysWaiting: i,
    footprintMm: { x: 40, y: 30 }, heightMm: 8, printMinutes: 20, filamentGrams: 10, colours: [c],
  }));
  const plate = suggestPlate(manyColours, { respectAms: false });
  assert.ok(plate.summary.amsSlotsNeeded > 4);
});

check('everything the plate leaves behind is counted', () => {
  const plate = suggestPlate(pressured);
  assert.strictEqual(plate.placed.length + plate.deferred, plate.queueSize);
});

check('selectForPlate chooses nothing when nothing fits the budget', () => {
  const chosen = selectForPlate(explodeQueue(pressured), { maxMinutes: 5 });
  assert.strictEqual(chosen.length, 0);
});


console.log('\nChoosing the best plate, not the first one');

/* One slow two-piece order against one quick order that can be finished.
   Taking "most urgent first" blindly spends the whole evening on the slow one
   and ships nothing. */
const blocker = [
  { orderId: 'slow', reference: 'BP-SLOW', sku: 'BIG', name: 'Big slow thing', quantity: 2, channel: 'etsy', status: 'placed', daysWaiting: 4,
    footprintMm: { x: 90, y: 80 }, heightMm: 60, printMinutes: 200, filamentGrams: 90, colours: ['matte-black'] },
  { orderId: 'quick', reference: 'BP-QUICK', sku: 'LITTLE', name: 'Little quick thing', quantity: 3, channel: 'amazon', status: 'placed', daysWaiting: 3,
    footprintMm: { x: 50, y: 30 }, heightMm: 8, printMinutes: 30, filamentGrams: 12, colours: ['matte-black'] },
];

check('a slow order does not block a plate that could clear a different one', () => {
  const plate = suggestPlate(blocker, { maxMinutes: 240 });
  assert.strictEqual(plate.orders.cleared.length, 1, 'expected one order cleared');
  assert.strictEqual(plate.orders.cleared[0].reference, 'BP-QUICK');
});

check('clearing an order beats merely filling the bed', () => {
  const plate = suggestPlate(blocker, { maxMinutes: 240 });
  assert.ok(plate.placed.every((p) => p.sku === 'LITTLE'));
});

check('plain urgency order needs no anchor when it already wins', () => {
  const plate = suggestPlate(blocker, { maxMinutes: 240 });
  assert.strictEqual(plate.anchoredOn, null);
});

/* The case the anchor search exists for. Taking the most urgent order first
   fits one order into the evening; starting from the second most urgent fits
   two. Nothing about urgency ordering can see that on its own. */
const anchorCase = [
  { orderId: 'A', reference: 'BP-A', sku: 'A1', name: 'One slow piece', quantity: 1, channel: 'amazon', status: 'placed', daysWaiting: 5,
    footprintMm: { x: 50, y: 40 }, heightMm: 10, printMinutes: 200, filamentGrams: 40, colours: ['matte-black'] },
  { orderId: 'B', reference: 'BP-B', sku: 'B1', name: 'Two quick pieces', quantity: 2, channel: 'amazon', status: 'placed', daysWaiting: 4,
    footprintMm: { x: 50, y: 40 }, heightMm: 10, printMinutes: 60, filamentGrams: 15, colours: ['matte-black'] },
  { orderId: 'C', reference: 'BP-C', sku: 'C1', name: 'One medium piece', quantity: 1, channel: 'amazon', status: 'placed', daysWaiting: 3,
    footprintMm: { x: 50, y: 40 }, heightMm: 10, printMinutes: 100, filamentGrams: 25, colours: ['matte-black'] },
];

check('starting from a less urgent order can ship more, and the planner finds it', () => {
  const plate = suggestPlate(anchorCase, { maxMinutes: 240 });
  assert.strictEqual(plate.orders.cleared.length, 2, `cleared ${plate.orders.cleared.length}`);
  assert.deepStrictEqual(plate.orders.cleared.map((o) => o.reference).sort(), ['BP-B', 'BP-C']);
});

check('the plan names the order it was anchored on', () => {
  const plate = suggestPlate(anchorCase, { maxMinutes: 240 });
  assert.strictEqual(plate.anchoredOn, 'B');
});

check('the anchored plan still respects the evening budget', () => {
  const plate = suggestPlate(anchorCase, { maxMinutes: 240 });
  assert.ok(plate.summary.totalMinutes <= 240, `got ${plate.summary.totalMinutes}`);
});

check('the same queue always produces the same plate', () => {
  const a = suggestPlate(blocker, { maxMinutes: 240 });
  const b = suggestPlate(blocker, { maxMinutes: 240 });
  assert.deepStrictEqual(a.placed.map((p) => p.id), b.placed.map((p) => p.id));
  assert.deepStrictEqual(a.placed.map((p) => [p.x, p.y]), b.placed.map((p) => [p.x, p.y]));
});

check('a plate the planner suggests is never one it would call unprintable', () => {
  const plate = suggestPlate(blocker);
  assert.strictEqual(plate.unplaced.length, 0);
  assert.strictEqual(plate.summary.overAmsCapacity, false);
});

check('travel overhead is capped, so a crowded plate stays believable', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => piece({ id: `s${i}`, w: 30, d: 20, minutes: 10 }));
  const s = plateSummary(twenty);
  // 20 parts x 10 min = 200. Uncapped the travel term alone would add 114.
  assert.ok(s.totalMinutes <= 200 * 1.25 + HEAT_UP_MINUTES, `got ${s.totalMinutes}`);
});

console.log(`\n${passed} checks passed\n`);
