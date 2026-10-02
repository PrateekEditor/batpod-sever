/**
 * Tests for the custom print estimator. No database.
 *   npm run test:estimate
 */
const assert = require('assert');
const { estimateCustomPrint, estimatorOptions, quantityFactor } = require('./customEstimate');

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

const base = {
  size: 'small',
  material: 'pla',
  quality: 'standard',
  complexity: 'simple',
  infill: 25,
  quantity: 1,
};

console.log('\nCustom print estimator');

test('a valid request returns a usable estimate', () => {
  const r = estimateCustomPrint(base);
  assert.strictEqual(r.ok, true);
  assert.ok(r.estimate.totalFrom > 0);
  assert.ok(r.estimate.totalTo >= r.estimate.totalFrom, 'the top of the range must not be below the bottom');
  assert.ok(r.estimate.leadDays >= 1);
  assert.ok(r.breakdown.length === 5);
});

test('bad input is rejected with a readable reason, not a crash', () => {
  const r = estimateCustomPrint({ ...base, material: 'unobtainium' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('unobtainium'));
  assert.ok(r.errors[0].includes('pla'), 'the error should list what IS allowed');
});

test('missing quantity is rejected', () => {
  assert.strictEqual(estimateCustomPrint({ ...base, quantity: 0 }).ok, false);
  assert.strictEqual(estimateCustomPrint({ ...base, quantity: 'many' }).ok, false);
});

test('absurd quantities are pushed to a conversation', () => {
  const r = estimateCustomPrint({ ...base, quantity: 5000 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].toLowerCase().includes('talk to us'));
});

test('a bigger object costs more', () => {
  const small = estimateCustomPrint({ ...base, size: 'keyring' }).estimate.totalTo;
  const large = estimateCustomPrint({ ...base, size: 'large' }).estimate.totalTo;
  assert.ok(large > small * 3, `large (${large}) should dwarf a keyring (${small})`);
});

test('finer layers cost more and take longer', () => {
  const draft = estimateCustomPrint({ ...base, quality: 'draft' }).estimate;
  const fine = estimateCustomPrint({ ...base, quality: 'fine' }).estimate;
  assert.ok(fine.totalTo > draft.totalTo);
  assert.ok(fine.totalPrintHours > draft.totalPrintHours);
});

test('higher infill uses more material', () => {
  const light = estimateCustomPrint({ ...base, infill: 15 }).estimate.gramsPerUnit;
  const heavy = estimateCustomPrint({ ...base, infill: 60 }).estimate.gramsPerUnit;
  assert.ok(heavy > light);
});

test('complex parts cost more than simple ones', () => {
  const simple = estimateCustomPrint({ ...base, complexity: 'simple' }).estimate.totalTo;
  const complex = estimateCustomPrint({ ...base, complexity: 'complex' }).estimate.totalTo;
  assert.ok(complex > simple);
});

test('TPU costs more than PLA for the same shape', () => {
  const pla = estimateCustomPrint({ ...base, material: 'pla' }).estimate.totalTo;
  const tpu = estimateCustomPrint({ ...base, material: 'tpu' }).estimate.totalTo;
  assert.ok(tpu > pla);
});

test('multi-colour adds material because of purge waste', () => {
  const one = estimateCustomPrint({ ...base, colours: 1 }).estimate.gramsPerUnit;
  const three = estimateCustomPrint({ ...base, colours: 3 }).estimate.gramsPerUnit;
  assert.ok(three > one * 1.5, 'three colours should be noticeably more filament');
});

test('ten units cost less each than one unit', () => {
  const one = estimateCustomPrint({ ...base, quantity: 1 }).estimate.unitPriceTo;
  const ten = estimateCustomPrint({ ...base, quantity: 10 }).estimate.unitPriceTo;
  assert.ok(ten < one, `unit price should fall with quantity (${ten} vs ${one})`);
});

test('but ten units still cost more in total than one', () => {
  const one = estimateCustomPrint({ ...base, quantity: 1 }).estimate.totalTo;
  const ten = estimateCustomPrint({ ...base, quantity: 10 }).estimate.totalTo;
  assert.ok(ten > one);
});

test('quantity factor never increases with quantity', () => {
  let last = Infinity;
  for (const q of [1, 5, 10, 20, 50, 100]) {
    const f = quantityFactor(q);
    assert.ok(f <= last, `factor rose at qty ${q}`);
    last = f;
  }
});

test('rush costs more and arrives sooner', () => {
  const normal = estimateCustomPrint({ ...base, size: 'medium', quantity: 5 }).estimate;
  const rush = estimateCustomPrint({ ...base, size: 'medium', quantity: 5, rush: true }).estimate;
  assert.ok(rush.totalTo > normal.totalTo);
  assert.ok(rush.leadDays <= normal.leadDays);
});

test('lead time grows with the size of the job', () => {
  const one = estimateCustomPrint({ ...base, size: 'large', quantity: 1 }).estimate.leadDays;
  const fifty = estimateCustomPrint({ ...base, size: 'large', quantity: 50 }).estimate.leadDays;
  assert.ok(fifty > one);
});

test('a parsed mesh overrides the size bucket', () => {
  const bucket = estimateCustomPrint(base).estimate;
  const mesh = estimateCustomPrint({ ...base, mesh: { volumeCm3: 45 } }).estimate;
  assert.strictEqual(mesh.basis, 'mesh');
  assert.strictEqual(bucket.basis, 'size-bucket');
  // Same volume as the 'small' bucket, so the numbers should match
  assert.strictEqual(mesh.gramsPerUnit, bucket.gramsPerUnit);
});

test('a mesh with no volume is rejected rather than quoted at zero', () => {
  const r = estimateCustomPrint({ ...base, mesh: { volumeCm3: 0 } });
  assert.strictEqual(r.ok, false);
});

test('the quote is always presented as a range with headroom', () => {
  const r = estimateCustomPrint(base);
  assert.ok(r.estimate.totalTo > r.estimate.totalFrom, 'a single number would imply false precision');
  assert.ok(r.notes.some((n) => n.toLowerCase().includes('ceiling')));
  assert.ok(r.disclaimer.length > 0);
});

test('options list exactly what the engine accepts', () => {
  const o = estimatorOptions();
  for (const m of o.materials) assert.strictEqual(estimateCustomPrint({ ...base, material: m.value }).ok, true);
  for (const q of o.qualities) assert.strictEqual(estimateCustomPrint({ ...base, quality: q.value }).ok, true);
  for (const c of o.complexities) assert.strictEqual(estimateCustomPrint({ ...base, complexity: c.value }).ok, true);
  for (const i of o.infills) assert.strictEqual(estimateCustomPrint({ ...base, infill: i.value }).ok, true);
  for (const s of o.sizes) assert.strictEqual(estimateCustomPrint({ ...base, size: s.value }).ok, true);
});

test('nothing is ever quoted below what the material costs', () => {
  const o = estimatorOptions();
  for (const s of o.sizes) {
    for (const m of o.materials) {
      const r = estimateCustomPrint({ ...base, size: s.value, material: m.value, quantity: 1 });
      const materialLine = r.breakdown.find((b) => b.label === 'Material');
      assert.ok(r.estimate.totalFrom > materialLine.amount, `${s.value}/${m.value} quoted under material cost`);
    }
  }
});

console.log(`\n${passed} checks passed\n`);
