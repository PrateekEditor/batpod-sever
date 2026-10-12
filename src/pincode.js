/**
 * Pincode lookup and delivery estimate.
 *
 * India Post publishes the pincode directory through a free, keyless API
 * (api.postalpincode.in). The shop asks for the pincode first, fills in the
 * city and state from it, and shows a delivery window — the same window the
 * workshop quotes on WhatsApp, so the two never disagree.
 *
 * Transit days are by courier zone from Pune, measured, not promised: the
 * window is wide enough that a parcel arriving at the far end is still "on
 * time". One production day is added for packing; made-to-order lines add
 * their print time on top in the cart.
 */
const UPSTREAM = 'https://api.postalpincode.in/pincode/';
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

/** Transit days [min, max] from Pune, by state, courier surface rates. */
const ZONES = [
  { days: [1, 2], states: ['Maharashtra'] },
  { days: [2, 4], states: ['Goa', 'Gujarat', 'Karnataka', 'Madhya Pradesh', 'Telangana', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Dadra & Nagar Haveli', 'Daman & Diu'] },
  { days: [3, 5], states: ['Andhra Pradesh', 'Tamil Nadu', 'Kerala', 'Puducherry', 'Rajasthan', 'Delhi', 'NCT of Delhi', 'Haryana', 'Uttar Pradesh', 'Odisha', 'Jharkhand', 'West Bengal', 'Bihar', 'Punjab', 'Chandigarh', 'Uttarakhand', 'Himachal Pradesh'] },
  { days: [5, 8], states: ['Assam', 'Sikkim', 'Meghalaya', 'Tripura', 'Jammu and Kashmir', 'Jammu & Kashmir', 'Ladakh'] },
  { days: [7, 10], states: ['Arunachal Pradesh', 'Manipur', 'Mizoram', 'Nagaland', 'Andaman and Nicobar Islands', 'Andaman & Nicobar Islands', 'Lakshadweep'] },
];
const DEFAULT_DAYS = [4, 7];

function transitDays(state) {
  const s = String(state || '').trim().toLowerCase();
  for (const z of ZONES) if (z.states.some((x) => x.toLowerCase() === s)) return z.days;
  return DEFAULT_DAYS;
}

/** Skip Sundays — no courier pickups, no deliveries. */
function addWorkingDays(from, days) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) left -= 1;
  }
  return d;
}

/** The delivery window for a state, given production days before dispatch. */
function estimate(state, { productionDays = 1, from = new Date() } = {}) {
  const [lo, hi] = transitDays(state);
  return {
    transitDays: [lo, hi],
    productionDays,
    from: addWorkingDays(from, productionDays + lo),
    to: addWorkingDays(from, productionDays + hi),
  };
}

function normalise(pin, offices) {
  const first = offices[0];
  // The "Block" is usually the city for urban pincodes; District is the fallback.
  const city = first.Block && first.Block !== 'NA' ? first.Block : first.District;
  return {
    pincode: pin,
    city,
    district: first.District,
    state: first.State,
    area: first.Name,
    offices: offices.slice(0, 8).map((o) => o.Name),
  };
}

/** Look a pincode up. Returns null when India Post does not know it. */
async function lookup(pin, fetchImpl = fetch) {
  const clean = String(pin || '').replace(/\D/g, '');
  if (!/^[1-9]\d{5}$/.test(clean)) return null;
  const hit = cache.get(clean);
  if (hit && hit.at > Date.now() - TTL_MS) return hit.value;

  const res = await fetchImpl(UPSTREAM + clean, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`pincode upstream ${res.status}`);
  const body = await res.json();
  const entry = Array.isArray(body) ? body[0] : null;
  const value = entry && entry.Status === 'Success' && Array.isArray(entry.PostOffice) && entry.PostOffice.length
    ? normalise(clean, entry.PostOffice)
    : null;
  cache.set(clean, { at: Date.now(), value });
  return value;
}

module.exports = { lookup, estimate, transitDays, addWorkingDays, _cache: cache };
