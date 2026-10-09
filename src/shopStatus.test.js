/* Shop status gate. Plain node, no database: the model is stubbed. */
const assert = require('assert');
const Module = require('module');

// Stub the model so getStatus/setStatus run against an in-memory document.
let doc = null;
const fakeModel = {
  findOne: () => ({ lean: async () => doc }),
  findOneAndUpdate: (_q, { $set }) => ({ lean: async () => { doc = { ...(doc || {}), ...$set, updatedAt: new Date() }; return doc; } }),
};
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request.endsWith('models/ShopStatus')) return fakeModel;
  return realLoad.call(this, request, ...rest);
};
const { getStatus, setStatus, requireOpen } = require('./shopStatus');
Module._load = realLoad;

let passed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(() => { console.log(`  ok   ${name}`); passed += 1; })
    .catch((err) => { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; });
}
const res = () => { const r = { code: 200, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

(async () => {
  console.log('\nShop status');
  await check('with no document the shop is open', async () => {
    assert.strictEqual((await getStatus()).mode, 'open');
  });
  await check('a valid mode is stored and read back', async () => {
    const s = await setStatus({ mode: 'paused', message: 'Back Monday', until: '2026-10-13T09:00:00Z' });
    assert.strictEqual(s.mode, 'paused');
    assert.strictEqual(s.message, 'Back Monday');
    assert.ok(s.until instanceof Date);
  });
  await check('an unknown mode is ignored rather than stored', async () => {
    const s = await setStatus({ mode: 'closed-forever' });
    assert.strictEqual(s.mode, 'paused');
  });
  await check('a bad date is ignored and an empty one clears it', async () => {
    let s = await setStatus({ until: 'tomorrow-ish' });
    assert.ok(s.until);
    s = await setStatus({ until: '' });
    assert.strictEqual(s.until, null);
  });
  await check('messages are capped so a paste cannot bloat the document', async () => {
    const s = await setStatus({ message: 'x'.repeat(2000) });
    assert.strictEqual(s.message.length, 600);
  });
  await check('orders are refused while paused, with the status attached', async () => {
    await setStatus({ mode: 'paused' });
    const r = res(); let nexted = false;
    await requireOpen({}, r, () => { nexted = true; });
    assert.strictEqual(nexted, false);
    assert.strictEqual(r.code, 503);
    assert.strictEqual(r.body.status.mode, 'paused');
  });
  await check('orders pass through when open', async () => {
    await setStatus({ mode: 'open' });
    const r = res(); let nexted = false;
    await requireOpen({}, r, () => { nexted = true; });
    assert.strictEqual(nexted, true);
  });
  console.log(`\n${passed} checks passed\n`);
})();
