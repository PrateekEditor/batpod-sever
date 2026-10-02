/**
 * Shared costing assumptions.
 *
 * One place for "what does a print actually cost", used by the margin read-out
 * in the admin, the payback calculator and the custom-print estimator. Change a
 * number here and all three agree — which is the whole point of it being one file.
 *
 * Every default can be overridden per environment.
 */
const DEFAULTS = {
  filamentPerGram: Number(process.env.COST_FILAMENT_PER_GRAM || 1.2), // ₹ per gram, bulk PLA
  electricityPerUnit: Number(process.env.COST_ELECTRICITY_PER_UNIT || 9), // ₹ per kWh
  printerWatts: Number(process.env.COST_PRINTER_WATTS || 110), // A1 average draw
  failRate: Number(process.env.COST_FAIL_RATE || 0.08), // 8% of prints scrapped
  labourPerHour: Number(process.env.COST_LABOUR_PER_HOUR || 250), // what your time is worth
  packagingPerOrder: Number(process.env.COST_PACKAGING || 10),
  printerHoursPerDay: Number(process.env.PRINTER_HOURS_PER_DAY || 12),
};

/** Material properties for the estimator. Density in g/cm³, price in ₹/g. */
const MATERIALS = {
  pla: { label: 'PLA', density: 1.24, pricePerGram: 1.2, difficulty: 1.0 },
  petg: { label: 'PETG', density: 1.27, pricePerGram: 1.5, difficulty: 1.15 },
  abs: { label: 'ABS', density: 1.04, pricePerGram: 1.4, difficulty: 1.35 },
  tpu: { label: 'TPU (flexible)', density: 1.21, pricePerGram: 2.6, difficulty: 1.6 },
  'pla-silk': { label: 'PLA Silk', density: 1.24, pricePerGram: 1.9, difficulty: 1.05 },
  'pla-cf': { label: 'PLA Carbon Fibre', density: 1.3, pricePerGram: 3.2, difficulty: 1.25 },
};

/** Layer height presets. Lower layers look better and take proportionally longer. */
const QUALITIES = {
  draft: { label: 'Draft — 0.28 mm', layerHeight: 0.28, throughputGramsPerHour: 22, surcharge: 0 },
  standard: { label: 'Standard — 0.20 mm', layerHeight: 0.2, throughputGramsPerHour: 16, surcharge: 0 },
  fine: { label: 'Fine — 0.12 mm', layerHeight: 0.12, throughputGramsPerHour: 10, surcharge: 0.1 },
};

/** Rough size buckets, so a customer doesn't need to measure anything. */
const SIZES = {
  keyring: { label: 'Keyring / badge — fits in a palm', volumeCm3: 9, example: 'keychain, fridge magnet, cable clip' },
  small: { label: 'Small — like a teacup', volumeCm3: 45, example: 'figure, phone stand, small bracket' },
  medium: { label: 'Medium — like a shoe', volumeCm3: 160, example: 'helmet hook, desk organiser, planter' },
  large: { label: 'Large — like a football', volumeCm3: 420, example: 'display piece, large enclosure' },
  xl: { label: 'Extra large — needs splitting', volumeCm3: 900, example: 'printed in parts and joined' },
};

/** How solid and how fiddly. Drives both material and the hands-on time. */
const COMPLEXITIES = {
  simple: { label: 'Simple — flat-ish, no overhangs', solidity: 0.55, timeFactor: 1.0, cleanupMinutes: 6, supports: false },
  moderate: { label: 'Moderate — some overhangs', solidity: 0.65, timeFactor: 1.2, cleanupMinutes: 14, supports: true },
  complex: { label: 'Complex — fine detail, lots of supports', solidity: 0.8, timeFactor: 1.5, cleanupMinutes: 30, supports: true },
};

const INFILLS = {
  15: { label: '15% — display only', factor: 0.9 },
  25: { label: '25% — normal use', factor: 1.0 },
  40: { label: '40% — takes a knock', factor: 1.2 },
  60: { label: '60% — structural', factor: 1.45 },
};

/**
 * What one unit of an existing catalog product costs to make.
 * Mirrors the figures in the economics calculator exactly.
 */
function unitCost(product, settings = DEFAULTS) {
  const material = (product.filamentGrams || 0) * settings.filamentPerGram;
  const power = (settings.printerWatts / 1000) * (product.printHours || 0) * settings.electricityPerUnit;
  const scrap = (material + power) * settings.failRate;
  const labour = ((product.handsOnMinutes || 0) / 60) * settings.labourPerHour;
  return Math.round(material + power + scrap + labour + settings.packagingPerOrder);
}

module.exports = { DEFAULTS, MATERIALS, QUALITIES, SIZES, COMPLEXITIES, INFILLS, unitCost };
