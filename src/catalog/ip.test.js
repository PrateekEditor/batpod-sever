/* Rights classification checks. Plain node, no framework. */
const assert = require('assert');
const { IP_STATUSES, VERDICTS, SELLABLE, LICENCE_STALE_DAYS, suggestedVerdict, reviewIssues } = require('./ip');
const { products } = require('../seed-data');

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); passed += 1; }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const NOW = new Date('2026-10-01T00:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000);

console.log('\nSuggested verdicts');

check('your own designs, generic objects and personalised items point to yes', () => {
  for (const s of ['original', 'generic-functional', 'personalised']) assert.strictEqual(suggestedVerdict(s), 'yes', s);
});

check('fan art points to no', () => {
  assert.strictEqual(suggestedVerdict('fan-art'), 'no');
});

check('a commercial licence only earns caution, never an automatic yes', () => {
  assert.strictEqual(suggestedVerdict('licensed-commercial'), 'caution');
});

check('public domain earns caution, because the trademark may still be live', () => {
  assert.strictEqual(suggestedVerdict('public-domain'), 'caution');
});

check('an unreviewed product is caution, not quietly safe', () => {
  assert.strictEqual(suggestedVerdict('unknown'), 'caution');
  assert.strictEqual(suggestedVerdict(undefined), 'caution');
});

console.log('\nReview issues');

check('a complete record for a generic item raises nothing', () => {
  assert.deepStrictEqual(reviewIssues({ ipStatus: 'generic-functional', sellableVerdict: 'yes' }, NOW), []);
});

check('an unreviewed product is flagged', () => {
  assert.ok(reviewIssues({ ipStatus: 'unknown', sellableVerdict: 'caution' }, NOW).some((i) => /Not reviewed/.test(i)));
});

check('fan art marked anything but no is flagged', () => {
  assert.ok(reviewIssues({ ipStatus: 'fan-art', sellableVerdict: 'caution' }, NOW).some((i) => /licence or not/.test(i)));
});

check('fan art correctly marked no raises no fan-art issue', () => {
  assert.ok(!reviewIssues({ ipStatus: 'fan-art', sellableVerdict: 'no' }, NOW).some((i) => /licence or not/.test(i)));
});

check('a commercial licence with no reference is flagged', () => {
  const issues = reviewIssues({ ipStatus: 'licensed-commercial', sellableVerdict: 'caution', modelSource: 'MakerWorld' }, NOW);
  assert.ok(issues.some((i) => /licence not recorded/.test(i)));
});

check('a licence with no check date is flagged', () => {
  const issues = reviewIssues({ ipStatus: 'licensed-commercial', modelSource: 'x', licenceRef: 'ORD-1' }, NOW);
  assert.ok(issues.some((i) => /no check date/.test(i)));
});

check('a licence checked long ago is flagged as stale', () => {
  const issues = reviewIssues({ ipStatus: 'licensed-commercial', modelSource: 'x', licenceRef: 'ORD-1', licenceCheckedOn: daysAgo(LICENCE_STALE_DAYS + 10) }, NOW);
  assert.ok(issues.some((i) => /last checked/.test(i)));
});

check('a recently checked licence is not flagged', () => {
  const issues = reviewIssues({ ipStatus: 'licensed-commercial', modelSource: 'x', licenceRef: 'ORD-1', licenceCheckedOn: daysAgo(10) }, NOW);
  assert.deepStrictEqual(issues, []);
});

console.log('\nThe storefront filter');

check('the public filter hides products marked no', () => {
  assert.deepStrictEqual(SELLABLE.sellableVerdict, { $ne: 'no' });
  assert.strictEqual(SELLABLE.active, true);
});

check('the public filter cannot be mutated by a route that spreads it', () => {
  assert.throws(() => { 'use strict'; SELLABLE.active = false; });
});

console.log('\nThe seeded catalogue');

check('every seeded product carries a valid status and verdict', () => {
  for (const p of products) {
    assert.ok(IP_STATUSES.includes(p.ipStatus), `${p.slug}: ${p.ipStatus}`);
    assert.ok(VERDICTS.includes(p.sellableVerdict), `${p.slug}: ${p.sellableVerdict}`);
  }
});

check('every seeded product explains its classification', () => {
  for (const p of products) assert.ok(p.ipNotes && p.ipNotes.length > 20, `${p.slug} has no note`);
});

check('no seeded product claims a licence it does not have', () => {
  for (const p of products) assert.ok(!p.licenceRef, `${p.slug} has a licenceRef in seed data`);
});

check('the bike-brand items are held at caution, not waved through', () => {
  const branded = products.filter((p) => /dominar|bike-desk/.test(p.slug));
  assert.ok(branded.length >= 2);
  for (const p of branded) assert.strictEqual(p.sellableVerdict, 'caution', p.slug);
});


console.log('\nKept off the storefront');

check('every rights field is hidden from queries unless explicitly asked for', () => {
  const Product = require('../models/Product');
  const { IP_FIELDS } = require('./ip');
  for (const f of IP_FIELDS) {
    const path = Product.schema.path(f);
    assert.ok(path, `${f} missing from the schema`);
    assert.strictEqual(path.options.select, false, `${f} would be returned to the storefront`);
  }
});

check('a new product defaults to unreviewed and caution, never to safe', () => {
  const Product = require('../models/Product');
  const p = new Product({ sku: 'T-1', slug: 't-1', name: 'Test', categorySlug: 'daily', listPrice: 1 });
  assert.strictEqual(p.ipStatus, 'unknown');
  assert.strictEqual(p.sellableVerdict, 'caution');
});

check('the schema enums match the rules module exactly', () => {
  const Product = require('../models/Product');
  assert.deepStrictEqual(Product.schema.path('ipStatus').enumValues, IP_STATUSES);
  assert.deepStrictEqual(Product.schema.path('sellableVerdict').enumValues, VERDICTS);
});

console.log(`\n${passed} checks passed\n`);
process.exit(process.exitCode || 0);
