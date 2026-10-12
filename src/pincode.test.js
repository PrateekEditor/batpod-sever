/* Pincode lookup and delivery windows. Plain node; the upstream is stubbed. */
const assert = require('assert');
const { lookup, estimate, transitDays, addWorkingDays, _cache } = require('./pincode');

let passed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(() => { console.log(`  ok   ${name}`); passed += 1; })
    .catch((err) => { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; });
}
const fake = (payload, status = 200) => async () => ({ ok: status === 200, status, json: async () => payload });
const PUNE = [{ Status: 'Success', PostOffice: [{ Name: 'Baner', Block: 'Pune City', District: 'Pune', State: 'Maharashtra' }] }];

(async () => {
  console.log('\nPincode');
  await check('a Pune pincode resolves to city and state', async () => {
    const r = await lookup('411045', fake(PUNE));
    assert.strictEqual(r.city, 'Pune City');
    assert.strictEqual(r.state, 'Maharashtra');
    assert.strictEqual(r.area, 'Baner');
  });
  await check('the second call is served from cache, not the network', async () => {
    let calls = 0;
    await lookup('411045', async () => { calls += 1; return { ok: true, json: async () => PUNE }; });
    assert.strictEqual(calls, 0);
  });
  await check('a malformed pincode is rejected without a network call', async () => {
    let calls = 0;
    const r = await lookup('12', async () => { calls += 1; });
    assert.strictEqual(r, null);
    assert.strictEqual(calls, 0);
  });
  await check('an unknown pincode returns null', async () => {
    const r = await lookup('999999', fake([{ Status: 'Error', PostOffice: null }]));
    assert.strictEqual(r, null);
  });
  await check('a District stands in when Block is NA', async () => {
    _cache.clear();
    const r = await lookup('403001', fake([{ Status: 'Success', PostOffice: [{ Name: 'Panaji', Block: 'NA', District: 'North Goa', State: 'Goa' }] }]));
    assert.strictEqual(r.city, 'North Goa');
  });

  console.log('\nDelivery window');
  await check('Maharashtra is the fastest zone', () => assert.deepStrictEqual(transitDays('Maharashtra'), [1, 2]));
  await check('neighbouring states are the next zone', () => assert.deepStrictEqual(transitDays('Gujarat'), [2, 4]));
  await check('the far north-east is the slowest', () => assert.deepStrictEqual(transitDays('Mizoram'), [7, 10]));
  await check('an unknown state gets the default, not an error', () => assert.deepStrictEqual(transitDays('Atlantis'), [4, 7]));
  await check('Sundays are skipped when counting days', () => {
    const sat = new Date('2026-10-10T10:00:00'); // Saturday
    const d = addWorkingDays(sat, 1);
    assert.strictEqual(d.getDay(), 1); // Monday
  });
  await check('the window includes production days and both transit ends', () => {
    const e = estimate('Maharashtra', { productionDays: 1, from: new Date('2026-10-12T10:00:00') }); // Monday
    assert.strictEqual(e.from.getDate(), 14);
    assert.strictEqual(e.to.getDate(), 15);
  });

  console.log(`\n${passed} checks passed\n`);
})();
