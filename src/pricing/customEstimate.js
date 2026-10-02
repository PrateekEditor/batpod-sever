/**
 * Custom print estimator.
 *
 * Pure function, no database. Given what the customer picked (or, later, what a
 * parsed STL reported), it returns a price, a lead time and the reasoning.
 *
 * Two things shape the design:
 *
 * 1. **It deliberately over-estimates.** Nobody can price a mesh they have not
 *    sliced. Quoting low and asking for more money later is the fastest way to
 *    lose a customer, so the number quoted carries a buffer and is presented as
 *    a ceiling that usually comes down once the real file is sliced.
 *
 * 2. **The mesh path is already here.** Pass `mesh: { volumeCm3, boundingBox }`
 *    and it uses the real volume instead of the size bucket. When STL parsing
 *    is added, nothing about this contract changes — which matters because
 *    other people will have integrated against it by then.
 */
const { DEFAULTS, MATERIALS, QUALITIES, SIZES, COMPLEXITIES, INFILLS } = require('./costing');

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const rupees = (n) => Math.round(n);

/** Markup over cost, before the over-estimate buffer. */
const MARGIN_MULTIPLIER = Number(process.env.CUSTOM_MARGIN_MULTIPLIER || 2.6);
/** How much headroom the quote carries, because the file has not been sliced. */
const OVER_ESTIMATE = Number(process.env.CUSTOM_OVER_ESTIMATE || 1.18);
/** Setup time per job, regardless of quantity. */
const SETUP_MINUTES = Number(process.env.CUSTOM_SETUP_MINUTES || 12);

/** Quantity breaks. Printing ten of a thing is far less than ten times the work. */
function quantityFactor(qty) {
  if (qty >= 50) return 0.72;
  if (qty >= 20) return 0.8;
  if (qty >= 10) return 0.87;
  if (qty >= 5) return 0.93;
  return 1;
}

function validate(input) {
  const errors = [];
  const material = MATERIALS[input.material];
  const quality = QUALITIES[input.quality];
  const complexity = COMPLEXITIES[input.complexity];
  const infill = INFILLS[String(input.infill)];
  const size = input.mesh ? null : SIZES[input.size];

  if (!material) errors.push(`Unknown material "${input.material}". One of: ${Object.keys(MATERIALS).join(', ')}`);
  if (!quality) errors.push(`Unknown quality "${input.quality}". One of: ${Object.keys(QUALITIES).join(', ')}`);
  if (!complexity) errors.push(`Unknown complexity "${input.complexity}". One of: ${Object.keys(COMPLEXITIES).join(', ')}`);
  if (!infill) errors.push(`Unknown infill "${input.infill}". One of: ${Object.keys(INFILLS).join(', ')}`);
  if (!input.mesh && !size) errors.push(`Unknown size "${input.size}". One of: ${Object.keys(SIZES).join(', ')}`);
  if (input.mesh && !(input.mesh.volumeCm3 > 0)) errors.push('mesh.volumeCm3 must be a positive number.');

  const qty = parseInt(input.quantity, 10);
  if (!Number.isFinite(qty) || qty < 1) errors.push('quantity must be a whole number of at least 1.');
  if (qty > 500) errors.push('For more than 500 units, talk to us directly — the maths changes.');

  return { errors, material, quality, complexity, infill, size, qty };
}

/**
 * @param {Object} input
 * @param {string} input.size        keyring | small | medium | large | xl (ignored when mesh is given)
 * @param {Object} [input.mesh]      { volumeCm3, boundingBox } from a parsed file
 * @param {string} input.material    pla | petg | abs | tpu | pla-silk | pla-cf
 * @param {string} input.quality     draft | standard | fine
 * @param {string} input.complexity  simple | moderate | complex
 * @param {number} input.infill      15 | 25 | 40 | 60
 * @param {number} input.quantity
 * @param {number} [input.colours]   1 = single colour, 2+ uses the AMS and wastes filament on purges
 * @param {boolean} [input.rush]
 */
function estimateCustomPrint(input = {}, settings = DEFAULTS) {
  const { errors, material, quality, complexity, infill, size, qty } = validate(input);
  if (errors.length) return { ok: false, errors };

  const colours = Math.max(1, Math.min(4, parseInt(input.colours, 10) || 1));
  const rush = Boolean(input.rush);
  const fromMesh = Boolean(input.mesh);

  // --- material ------------------------------------------------------------
  const rawVolume = fromMesh ? input.mesh.volumeCm3 : size.volumeCm3;
  // A printed part is not solid: shell plus infill. Solidity comes from how
  // chunky the shape is, infill scales the inside.
  const effectiveVolume = rawVolume * complexity.solidity * infill.factor;
  let grams = effectiveVolume * material.density;

  // Multi-colour printing purges filament at every tool change. On an AMS this
  // is not a rounding error — it can double the material on a small part.
  const purgeWaste = colours > 1 ? (colours - 1) * 0.35 : 0;
  grams = grams * (1 + purgeWaste);

  if (complexity.supports) grams *= 1.12; // supports are printed and thrown away

  grams = round(grams);

  // --- time ----------------------------------------------------------------
  const printHoursEach = round((grams / quality.throughputGramsPerHour) * complexity.timeFactor);
  const totalPrintHours = round(printHoursEach * qty);

  const handsOnMinutes = SETUP_MINUTES + complexity.cleanupMinutes * qty;
  const handsOnHours = round(handsOnMinutes / 60);

  // --- cost ----------------------------------------------------------------
  const materialCost = grams * material.pricePerGram * qty;
  const powerCost = (settings.printerWatts / 1000) * totalPrintHours * settings.electricityPerUnit;
  const labourCost = handsOnHours * settings.labourPerHour;
  const scrapCost = (materialCost + powerCost) * settings.failRate * material.difficulty;
  const packaging = settings.packagingPerOrder;

  const cost = materialCost + powerCost + labourCost + scrapCost + packaging;

  // --- price ---------------------------------------------------------------
  let price = cost * MARGIN_MULTIPLIER * quantityFactor(qty);
  if (quality.surcharge) price *= 1 + quality.surcharge;
  if (rush) price *= 1.35;

  const quoted = price * OVER_ESTIMATE;
  // The band the real number almost always lands in once the file is sliced.
  const low = rupees(quoted * 0.82);
  const high = rupees(quoted);

  // --- lead time -----------------------------------------------------------
  const printDays = Math.ceil(totalPrintHours / settings.printerHoursPerDay);
  const complexityDays = complexity === COMPLEXITIES.complex ? 2 : complexity === COMPLEXITIES.moderate ? 1 : 0;
  let leadDays = 1 + printDays + complexityDays;
  if (qty >= 20) leadDays += 1;
  if (rush) leadDays = Math.max(1, Math.ceil(leadDays / 2));

  return {
    ok: true,
    input: {
      size: fromMesh ? 'from file' : size.label,
      material: material.label,
      quality: quality.label,
      complexity: complexity.label,
      infill: infill.label,
      quantity: qty,
      colours,
      rush,
    },
    estimate: {
      gramsPerUnit: grams,
      totalGrams: round(grams * qty),
      printHoursPerUnit: printHoursEach,
      totalPrintHours,
      handsOnMinutes: Math.round(handsOnMinutes),
      unitPriceFrom: rupees(low / qty),
      unitPriceTo: rupees(high / qty),
      totalFrom: low,
      totalTo: high,
      leadDays,
      basis: fromMesh ? 'mesh' : 'size-bucket',
    },
    breakdown: [
      { label: 'Material', amount: rupees(materialCost), detail: `${round(grams * qty)} g of ${material.label}` },
      { label: 'Machine time', amount: rupees(powerCost), detail: `${totalPrintHours} print hours` },
      { label: 'Hands-on work', amount: rupees(labourCost), detail: `${Math.round(handsOnMinutes)} minutes of setup and finishing` },
      { label: 'Failure allowance', amount: rupees(scrapCost), detail: `${Math.round(settings.failRate * material.difficulty * 100)}% — ${material.label} is ${material.difficulty > 1.2 ? 'fussy' : 'well behaved'}` },
      { label: 'Packaging', amount: rupees(packaging), detail: 'Mailer and card' },
    ],
    notes: [
      'This is a ceiling, not a final price. Nobody can price a model they have not sliced, so the quote carries headroom.',
      'Once the real file is sliced the number usually comes down. It can go up if the model turns out to need far more support than it looks like.',
      'Nothing is charged until you confirm the revised figure.',
      ...(colours > 1 ? [`Multi-colour printing purges filament at every change — that is why ${colours} colours costs more than ${colours} times nothing.`] : []),
      ...(rush ? ['Rush jobs jump the queue, which is what the surcharge pays for.'] : []),
    ],
    disclaimer:
      'Estimate only. Final price and lead time are confirmed after the file is reviewed, and you can walk away at that point.',
  };
}

/** The dropdown contents, so the UI never hardcodes options the engine does not accept. */
function estimatorOptions() {
  const list = (obj, extra = () => ({})) =>
    Object.entries(obj).map(([value, v]) => ({ value, label: v.label, ...extra(v) }));

  return {
    sizes: list(SIZES, (v) => ({ example: v.example })),
    materials: list(MATERIALS),
    qualities: list(QUALITIES),
    complexities: list(COMPLEXITIES),
    infills: Object.entries(INFILLS).map(([value, v]) => ({ value: Number(value), label: v.label })),
    maxQuantity: 500,
    acceptedFileTypes: ['.stl', '.3mf', '.obj', '.step', '.stp'],
    maxFileSizeMb: Number(process.env.CUSTOM_MAX_FILE_MB || 50),
  };
}

module.exports = { estimateCustomPrint, estimatorOptions, quantityFactor };
