/**
 * Rights classification for the catalogue.
 *
 * Every product records why you are allowed to sell it. The judgement gets
 * made once, when the product is added, and written down - rather than being
 * re-argued every time you look at the catalogue, or discovered for the first
 * time when a takedown notice arrives.
 *
 * None of this is ever returned to the storefront. The fields are declared
 * `select: false` on the model, so a public route has to opt in to see them
 * and none do.
 */

/** Why a product is (or is not) yours to sell. */
const IP_STATUSES = [
  'original',            // you designed it
  'public-domain',       // genuinely out of copyright AND not a live trademark
  'generic-functional',  // a hook, a clip, a holder - no character, no brand
  'personalised',        // the buyer supplies the text or image
  'licensed-commercial', // a downloaded design with a commercial licence
  'fan-art',             // someone else's character or brand
  'unknown',             // not reviewed yet
];

const VERDICTS = ['yes', 'caution', 'no'];

const IP_FIELDS = ['ipStatus', 'sellableVerdict', 'modelSource', 'licenceRef', 'licenceCheckedOn', 'ipNotes'];

/**
 * The storefront's product filter.
 *
 * A product marked "no" is treated exactly like a hidden one: it does not list,
 * does not price, and cannot be ordered. `$ne` rather than `$in: ['yes',
 * 'caution']` so products created before this field existed stay visible until
 * someone reviews them.
 */
const SELLABLE = Object.freeze({ active: true, sellableVerdict: { $ne: 'no' } });

/** Licence terms change. Past this many days, a recorded check is stale. */
const LICENCE_STALE_DAYS = 180;

/**
 * The verdict a status points towards.
 *
 * Only a suggestion: the verdict is stored separately because the status alone
 * cannot decide it. A licensed-commercial model of an original creature is
 * fine; a licensed-commercial model of a cartoon character is not, licence or
 * no licence - the licence covers the sculptor's work, never the character.
 */
function suggestedVerdict(ipStatus) {
  switch (ipStatus) {
    case 'original':
    case 'generic-functional':
    case 'personalised':
      return 'yes';
    case 'fan-art':
      return 'no';
    case 'public-domain':
    case 'licensed-commercial':
    case 'unknown':
    default:
      return 'caution';
  }
}

function daysSince(date, now = Date.now()) {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86400000);
}

/**
 * What is wrong with a product's rights record, in plain words.
 *
 * An empty list means the record is complete and consistent - not that the
 * product is legally safe, which nothing here can promise.
 */
function reviewIssues(product, now = Date.now()) {
  const issues = [];
  const status = product.ipStatus || 'unknown';
  const verdict = product.sellableVerdict || 'caution';

  if (status === 'unknown') issues.push('Not reviewed yet');

  if (status === 'fan-art' && verdict !== 'no') {
    issues.push("Fan art of someone else's character or brand cannot be sold, licence or not");
  }

  if (verdict === 'yes' && status === 'unknown') {
    issues.push('Marked sellable without a recorded reason');
  }

  if (status === 'licensed-commercial' && !product.licenceRef) {
    issues.push('Commercial licence not recorded - add the order or licence reference');
  }

  if ((status === 'licensed-commercial' || status === 'public-domain') && !product.modelSource) {
    issues.push('Model source not recorded');
  }

  if (product.licenceRef) {
    const age = daysSince(product.licenceCheckedOn, now);
    if (age === null) issues.push('Licence recorded but no check date');
    else if (age > LICENCE_STALE_DAYS) issues.push(`Licence last checked ${age} days ago`);
  }

  return issues;
}

module.exports = {
  IP_STATUSES,
  VERDICTS,
  IP_FIELDS,
  SELLABLE,
  LICENCE_STALE_DAYS,
  suggestedVerdict,
  reviewIssues,
};
