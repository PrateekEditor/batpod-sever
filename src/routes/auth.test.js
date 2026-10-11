/* Signup hygiene: password rules and profile/consent cleaning. Plain node. */
const assert = require('assert');
const { passwordProblem, cleanProfile, cleanConsent } = require('./auth');

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); passed += 1; }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

console.log('\nPasswords');
check('short passwords are refused', () => assert.ok(passwordProblem('abc123', 'a@b.com')));
check('common passwords are refused', () => assert.ok(passwordProblem('password', 'a@b.com')));
check('the email address is not a password', () => assert.ok(passwordProblem('rider@batpod.in', 'rider@batpod.in')));
check('a decent passphrase passes', () => assert.strictEqual(passwordProblem('dominar-400-rides', 'a@b.com'), null));
check('absurdly long input is refused', () => assert.ok(passwordProblem('x'.repeat(200), 'a@b.com')));

console.log('\nProfile');
check('unknown choices are dropped, known ones kept', () => {
  const p = cleanProfile({ rides: 'tour', bikeModel: ' Dominar 400 ', useFor: ['desk', 'nope', 'gifting'], contactPref: 'fax', offersOptIn: 'yes' });
  assert.strictEqual(p.rides, 'tour');
  assert.strictEqual(p.bikeModel, 'Dominar 400');
  assert.deepStrictEqual(p.useFor, ['desk', 'gifting']);
  assert.strictEqual(p.contactPref, '');
  assert.strictEqual(p.offersOptIn, true);
});
check('garbage input yields an empty profile', () => {
  const p = cleanProfile('hello');
  assert.strictEqual(typeof p, 'object');
});

console.log('\nConsent');
check('consent is stamped with a time and version', () => {
  const c = cleanConsent({ marketing: true, personalisation: false });
  assert.strictEqual(c.marketing, true);
  assert.strictEqual(c.personalisation, false);
  assert.ok(c.at instanceof Date);
  assert.ok(typeof c.version === 'string' && c.version.length > 0);
});

console.log(`\n${passed} checks passed\n`);
