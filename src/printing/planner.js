/**
 * Plate planner.
 *
 * The question this answers is the one you actually face on a weekday evening:
 * there are more orders than the printer can clear tonight, so what goes on the
 * next plate?
 *
 * Everything here is a pure function over plain objects. No database, no dates
 * read from the clock, no randomness — the same queue always produces the same
 * plate, which is what makes it testable and what makes the admin trustworthy.
 */

/** Bed sizes, in millimetres. The A1 Combo is the one you own. */
const PRINTERS = {
  'a1': { id: 'a1', name: 'Bambu A1', bed: { x: 256, y: 256, z: 256 }, ams: true, amsSlots: 4 },
  'a1-mini': { id: 'a1-mini', name: 'Bambu A1 mini', bed: { x: 180, y: 180, z: 180 }, ams: true, amsSlots: 4 },
  'p1s': { id: 'p1s', name: 'Bambu P1S', bed: { x: 256, y: 256, z: 256 }, ams: true, amsSlots: 4 },
};

const DEFAULT_PRINTER = 'a1';

/**
 * Packing constants.
 *
 * EDGE_MARGIN keeps parts off the very edge of the plate, where adhesion is
 * worst and where the purge line is laid down. PART_GAP is the gap between
 * neighbouring parts — tight enough not to waste the bed, wide enough that a
 * little elephant's foot on two adjacent brims does not fuse them together.
 */
const EDGE_MARGIN = 8;
const PART_GAP = 5;

/**
 * Time model.
 *
 * Part minutes come from the product. On top of that a plate carries fixed and
 * per-part overheads that a naive sum ignores, which is how people end up
 * planning six plates for an evening that only fits four:
 *
 *  - HEAT_UP_MINUTES: bed and nozzle reaching temperature, plus the bed-level
 *    probe and the purge line. Paid once per plate.
 *  - TRAVEL_OVERHEAD_PER_PART: with more parts on the plate the head spends
 *    more of each layer travelling between them instead of extruding. Modelled
 *    as a small percentage per extra part.
 *  - AMS_CHANGE_MINUTES / AMS_PURGE_GRAMS: every extra colour on a plate costs
 *    a flush of the hotend on each change. This is the cost people forget, and
 *    on a four-colour plate it dominates.
 */
const HEAT_UP_MINUTES = 6;
const TRAVEL_OVERHEAD_PER_PART = 0.03;
/** Travel overhead stops growing here. A crowded plate is slower, not endless. */
const TRAVEL_OVERHEAD_CAP = 0.25;
const AMS_CHANGE_MINUTES = 12;
const AMS_PURGE_GRAMS = 18;

/**
 * How long a suggested plate is allowed to run, by default.
 *
 * Twelve hours is one overnight print: start it before bed, unload it in the
 * morning. Without a cap the planner happily proposes a twenty-five hour plate
 * made of the four biggest things in the queue, which is technically a valid
 * packing and useless as a plan.
 */
const DEFAULT_PLATE_MINUTES = 720;

/** Channels that come with a dispatch deadline attached. */
const DEADLINE_CHANNELS = new Set(['amazon', 'etsy', 'partner-api']);

function printerFor(id) {
  return PRINTERS[id] || PRINTERS[DEFAULT_PRINTER];
}

/**
 * Orient a part so its wider side runs along X.
 *
 * Shelf packing stacks rows up the plate, so the depth of a part sets how much
 * of the plate that whole row consumes. Laying parts wide keeps rows shallow
 * and fits more of them. A part is free to spin on the bed, so this costs
 * nothing.
 */
function orient(piece) {
  const w = Number(piece.w) || 0;
  const d = Number(piece.d) || 0;
  if (d > w) return { w: d, d: w, rotated: true };
  return { w, d, rotated: false };
}

/**
 * Shelf bin-packing, first-fit by decreasing depth.
 *
 * Not optimal — optimal 2D packing is NP-hard and nobody needs it here — but it
 * is stable, explainable and leaves rows you can read at a glance, which
 * matters more when a human is looking at the result and deciding whether to
 * nudge something.
 */
function packPlate(pieces, printerId = DEFAULT_PRINTER) {
  const printer = printerFor(printerId);
  const bed = printer.bed;
  const usableRight = bed.x - EDGE_MARGIN;
  const usableBottom = bed.y - EDGE_MARGIN;

  const prepared = pieces.map((p, i) => {
    const o = orient(p);
    return { ...p, ...o, h: Number(p.h) || 0, _i: i };
  });

  // Deepest first. Ties broken by width then original order so the result is
  // deterministic for a given queue.
  prepared.sort((a, b) => b.d - a.d || b.w - a.w || a._i - b._i);

  const placed = [];
  const unplaced = [];

  let cursorX = EDGE_MARGIN;
  let cursorY = EDGE_MARGIN;
  let shelfDepth = 0;

  for (const piece of prepared) {
    if (piece.w <= 0 || piece.d <= 0) {
      unplaced.push({ ...piece, reason: 'no footprint recorded' });
      continue;
    }
    if (piece.h > bed.z) {
      unplaced.push({ ...piece, reason: `${piece.h}mm tall, bed clears ${bed.z}mm` });
      continue;
    }
    if (piece.w > usableRight - EDGE_MARGIN || piece.d > usableBottom - EDGE_MARGIN) {
      unplaced.push({ ...piece, reason: 'footprint larger than the plate' });
      continue;
    }

    // Does it fit on the current shelf?
    if (cursorX + piece.w > usableRight) {
      cursorY += shelfDepth + PART_GAP;
      cursorX = EDGE_MARGIN;
      shelfDepth = 0;
    }

    if (cursorY + piece.d > usableBottom) {
      unplaced.push({ ...piece, reason: 'plate full' });
      continue;
    }

    placed.push({ ...piece, x: cursorX, y: cursorY });
    cursorX += piece.w + PART_GAP;
    shelfDepth = Math.max(shelfDepth, piece.d);
  }

  const bedArea = bed.x * bed.y;
  const usedArea = placed.reduce((s, p) => s + p.w * p.d, 0);

  return {
    printer,
    placed,
    unplaced,
    utilisation: bedArea > 0 ? Math.round((usedArea / bedArea) * 100) : 0,
  };
}

/** Distinct AMS colours a set of placed pieces needs. */
function coloursOn(placed) {
  const set = new Set();
  for (const p of placed) {
    for (const c of p.colours || []) set.add(c);
  }
  return [...set].sort();
}

/**
 * What a plate costs in time and filament, overheads included.
 *
 * `colourChanges` is one less than the number of colours: a single-colour plate
 * never flushes.
 */
function plateSummary(placed, printerId = DEFAULT_PRINTER) {
  const printer = printerFor(printerId);
  const colours = coloursOn(placed);
  const extraColours = Math.max(0, colours.length - 1);

  const partMinutes = placed.reduce((s, p) => s + (Number(p.minutes) || 0), 0);
  const travelFactor = Math.min(TRAVEL_OVERHEAD_CAP, TRAVEL_OVERHEAD_PER_PART * Math.max(0, placed.length - 1));
  const travelMinutes = partMinutes * travelFactor;
  const amsMinutes = extraColours * AMS_CHANGE_MINUTES;
  const totalMinutes = placed.length === 0 ? 0 : Math.round(HEAT_UP_MINUTES + partMinutes + travelMinutes + amsMinutes);

  const partGrams = placed.reduce((s, p) => s + (Number(p.grams) || 0), 0);
  const purgeGrams = extraColours * AMS_PURGE_GRAMS;

  return {
    printer: printer.id,
    pieces: placed.length,
    colours,
    colourChanges: extraColours,
    partMinutes: Math.round(partMinutes),
    overheadMinutes: Math.round(HEAT_UP_MINUTES + travelMinutes + amsMinutes),
    totalMinutes,
    partGrams: Math.round(partGrams),
    purgeGrams,
    totalGrams: Math.round(partGrams + purgeGrams),
    amsSlotsNeeded: colours.length,
    overAmsCapacity: colours.length > printer.amsSlots,
  };
}

/**
 * How badly a queued piece wants to be on this plate.
 *
 * Marketplace orders carry a dispatch deadline and a penalty for missing it;
 * an order from a video description does not. After that it is simply age —
 * the oldest thing waiting goes first, which is the only tie-break a customer
 * would consider fair.
 */
function urgencyScore(item) {
  let score = 0;
  if (DEADLINE_CHANNELS.has(item.channel)) score += 1000;
  if (item.status === 'printing') score += 200;
  score += (Number(item.daysWaiting) || 0) * 10;
  return score;
}

function urgencyLabel(item) {
  if (DEADLINE_CHANNELS.has(item.channel)) return 'deadline';
  if ((Number(item.daysWaiting) || 0) >= 3) return 'ageing';
  return 'normal';
}

/**
 * Expand queue rows into one piece per unit.
 *
 * A line for three keychains is three objects on the bed, not one. Each piece
 * carries the order it belongs to so the plate can report which orders it
 * actually completes.
 */
function explodeQueue(items) {
  const pieces = [];
  for (const item of items) {
    const qty = Math.max(1, Number(item.quantity) || 1);
    for (let n = 0; n < qty; n += 1) {
      pieces.push({
        id: `${item.orderId}:${item.sku}:${n}`,
        orderId: item.orderId,
        reference: item.reference,
        sku: item.sku,
        name: item.name,
        channel: item.channel,
        status: item.status,
        daysWaiting: item.daysWaiting,
        w: item.footprintMm ? item.footprintMm.x : 0,
        d: item.footprintMm ? item.footprintMm.y : 0,
        h: item.heightMm || 0,
        minutes: item.printMinutes || 0,
        grams: item.filamentGrams || 0,
        colours: item.colours || [],
        urgency: urgencyScore(item),
        urgencyLabel: urgencyLabel(item),
      });
    }
  }
  return pieces.sort((a, b) => b.urgency - a.urgency || a.id.localeCompare(b.id));
}

/**
 * Which orders a plate finishes outright.
 *
 * A plate that prints four of the five pieces an order needs has not helped
 * you ship anything. This is the number worth looking at, and it is the reason
 * the planner prefers to finish orders rather than cherry-pick small parts.
 */
function ordersCleared(placedPieces, allPieces) {
  const needed = new Map();
  for (const p of allPieces) needed.set(p.orderId, (needed.get(p.orderId) || 0) + 1);

  const onPlate = new Map();
  for (const p of placedPieces) onPlate.set(p.orderId, (onPlate.get(p.orderId) || 0) + 1);

  const cleared = [];
  const partial = [];
  for (const [orderId, count] of onPlate) {
    const entry = {
      orderId,
      reference: (placedPieces.find((p) => p.orderId === orderId) || {}).reference,
      onPlate: count,
      outstanding: needed.get(orderId) || count,
    };
    if (count >= (needed.get(orderId) || 0)) cleared.push(entry);
    else partial.push(entry);
  }
  return { cleared, partial };
}

/**
 * Fill one plate from the queue, most urgent first.
 *
 * `maxMinutes` lets you say "I have four hours tonight" and get a plate that
 * fits the evening rather than one that fits the bed.
 */
/**
 * Choose which pieces go on the plate.
 *
 * This is deliberately separate from packing. `packPlate` sorts by depth
 * because that is what produces tidy rows — but if you let it both choose and
 * lay out, the bed fills with whatever happens to be deepest and the urgent
 * work falls off the end. So: walk the queue in urgency order, and keep a
 * piece only if the plate still packs, still fits the evening, and still fits
 * the AMS.
 *
 * `continue` rather than `break` on a rejection matters. A bulky part that
 * does not fit should not stop a small urgent one behind it from getting on.
 */
/** Pieces grouped by the order they belong to, most urgent order first. */
function urgencyOrderedGroups(pieces) {
  const groups = new Map();
  for (const p of pieces) {
    if (!groups.has(p.orderId)) groups.set(p.orderId, []);
    groups.get(p.orderId).push(p);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ua = Math.max(...a[1].map((p) => p.urgency));
      const ub = Math.max(...b[1].map((p) => p.urgency));
      // The id tie-break is not cosmetic: without it the same queue could
      // produce two different plates, and a planner you cannot predict is one
      // you stop trusting.
      return ub - ua || String(a[0]).localeCompare(String(b[0]));
    })
    .map(([id, group]) => ({ id, group }));
}

/**
 * Choose which pieces go on the plate, given an order to consider orders in.
 *
 * Separate from packing on purpose. `packPlate` sorts by depth because that is
 * what makes tidy rows — but if it both chooses and lays out, the bed fills
 * with whatever happens to be deepest and the urgent work falls off the end.
 */
function selectForPlate(pieces, { printerId = DEFAULT_PRINTER, maxMinutes = DEFAULT_PLATE_MINUTES, respectAms = true, anchor = null } = {}) {
  const printer = printerFor(printerId);
  const chosen = [];

  /** Would this exact set make a plate you could actually run tonight? */
  const viable = (trial) => {
    const packed = packPlate(trial, printerId);
    if (packed.placed.length !== trial.length) return false;
    const summary = plateSummary(packed.placed, printerId);
    if (maxMinutes && summary.totalMinutes > maxMinutes) return false;
    if (respectAms && summary.amsSlotsNeeded > printer.amsSlots) return false;
    return true;
  };

  let ordered = urgencyOrderedGroups(pieces);
  if (anchor) {
    const first = ordered.find((g) => g.id === anchor);
    if (first) ordered = [first, ...ordered.filter((g) => g.id !== anchor)];
  }

  // Pass one: whole orders. This is the pass that makes the tool worth having.
  // Five of the six pieces an order needs is the same as zero to the customer
  // waiting for it, so take each order complete or not at all.
  for (const { group } of ordered) {
    if (viable([...chosen, ...group])) chosen.push(...group);
  }

  // Pass two: top up the leftover bed, still order by order, cheapest piece
  // first within an order. Going cheapest-first matters on a short evening —
  // one slow part can otherwise swallow a budget that would have taken four
  // quick ones.
  const taken = new Set(chosen.map((p) => p.id));
  for (const { group } of ordered) {
    const remaining = group
      .filter((p) => !taken.has(p.id))
      .sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id));
    for (const piece of remaining) {
      if (viable([...chosen, piece])) {
        chosen.push(piece);
        taken.add(piece.id);
      }
    }
  }

  return chosen;
}

/** More orders shipped wins; then more pieces; then a fuller bed. */
function scorePlan(plan) {
  return [plan.orders.cleared.length, plan.placed.length, plan.utilisation];
}

function beats(a, b) {
  const sa = scorePlan(a);
  const sb = scorePlan(b);
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i];
  }
  return false;
}

/**
 * Fill one plate from the queue.
 *
 * Taking the most urgent order first is the obvious rule and it is often the
 * wrong plate: a two-piece order that runs six hours can block four quick ones
 * that would have cleared a deadline. So the planner builds a plan anchored on
 * each order in turn and keeps whichever ships the most — "most urgent first"
 * is among the candidates, not imposed.
 *
 * `maxMinutes` lets you say "I have four hours tonight" and get a plate that
 * fits the evening rather than one that fits the bed. Pass null to lift it.
 */
function suggestPlate(items, { printerId = DEFAULT_PRINTER, maxMinutes = DEFAULT_PLATE_MINUTES, respectAms = true, only = null } = {}) {
  let pieces = explodeQueue(items);
  if (only && only.length) {
    const keep = new Set(only);
    pieces = pieces.filter((p) => keep.has(p.id));
  }

  const build = (chosen) => {
    const packed = packPlate(chosen, printerId);
    return {
      ...packed,
      summary: plateSummary(packed.placed, printerId),
      orders: ordersCleared(packed.placed, pieces),
    };
  };

  // A hand-picked set is an instruction, not a suggestion: lay out exactly what
  // was asked for and report whatever does not fit.
  let best;
  let anchoredOn = null;

  if (only && only.length) {
    best = build(pieces);
  } else {
    const opts = { printerId, maxMinutes, respectAms };
    best = build(selectForPlate(pieces, opts));
    for (const { id } of urgencyOrderedGroups(pieces)) {
      const candidate = build(selectForPlate(pieces, { ...opts, anchor: id }));
      if (beats(candidate, best)) {
        best = candidate;
        anchoredOn = id;
      }
    }
  }

  const onPlate = new Set(best.placed.map((p) => p.id));

  return {
    ...best,
    queueSize: pieces.length,
    deferred: pieces.filter((p) => !onPlate.has(p.id)).length,
    maxMinutes: maxMinutes || null,
    anchoredOn,
  };
}

module.exports = {
  PRINTERS,
  DEFAULT_PRINTER,
  EDGE_MARGIN,
  PART_GAP,
  HEAT_UP_MINUTES,
  AMS_CHANGE_MINUTES,
  AMS_PURGE_GRAMS,
  TRAVEL_OVERHEAD_CAP,
  DEFAULT_PLATE_MINUTES,
  DEADLINE_CHANNELS,
  orient,
  packPlate,
  plateSummary,
  coloursOn,
  urgencyScore,
  urgencyLabel,
  explodeQueue,
  ordersCleared,
  urgencyOrderedGroups,
  selectForPlate,
  suggestPlate,
};
