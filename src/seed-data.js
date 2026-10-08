/**
 * The starter catalog, pricing schedules and rules, kept separate from the seed
 * script so tests can import the same data the database gets.
 */
const categories = [
  {
    slug: 'biker',
    name: 'Bike & Rider',
    tagline: 'Made by someone who actually rides',
    description:
      'Keychains, hooks and nameplates for riders. Designed around real bikes and real annoyances, not generic shapes.',
    accent: '#B8860B',
    sortOrder: 1,
  },
  {
    slug: 'tabletop',
    name: 'Tabletop',
    tagline: 'Things that earn their desk space',
    description: 'Display pieces, flexi toys and desk models. The category people buy for themselves and then gift twice.',
    accent: '#1F3A5F',
    sortOrder: 2,
  },
  {
    slug: 'daily',
    name: 'Daily Fixes',
    tagline: 'Small problems, solved in plastic',
    description: 'Cable clips, hooks, organisers and keyrings. Cheap to make, quick to print, the range that builds repeat buyers.',
    accent: '#2F6B4F',
    sortOrder: 3,
  },
];

const products = [
  // --- Bike & Rider --------------------------------------------------------
  {
    sku: 'BP-BK-001', slug: 'dominar-silhouette-keychain', name: 'Dominar Silhouette Keychain',
    categorySlug: 'biker', listPrice: 249, tags: ['dominar', 'keyring', 'gift', 'two-tone'],
    shortDescription: 'Two-tone silhouette keyring, printed in matte black with a contrast base.',
    description: 'A clean side profile of the bike, printed in two colours on the AMS so there is no paint to chip. Fits a standard split ring. Prints in about 35 minutes, which is why it can stay cheap.',
    filamentGrams: 18, printHours: 1, handsOnMinutes: 9, stockOnHand: 24, featured: true, kitEligible: true, sortOrder: 1,
    footprintMm: { x: 72, y: 30 }, heightMm: 5, printMinutes: 35, colours: ['matte-black', 'gold'], supportsRequired: false,
    ipStatus: 'original', sellableVerdict: 'caution', modelSource: "Own CAD (planned)",
    ipNotes: "'Dominar' is a Bajaj Auto trademark and the profile is their vehicle design. Rename the listing (e.g. Matte Tourer Silhouette), keep the badge off, and describe fit, not brand, before selling at volume.",
  },
  {
    sku: 'BP-BK-002', slug: 'matte-helmet-wall-hook', name: 'Matte Helmet Wall Hook',
    categorySlug: 'biker', listPrice: 599, tags: ['helmet', 'wall', 'storage', 'garage'],
    shortDescription: 'Wall hook shaped to hold a full-face helmet without creasing the liner.',
    description: 'A wide saddle spreads the weight so the helmet liner keeps its shape. Takes two screws, holds a full-face comfortably. Printed solid at 40% infill.',
    filamentGrams: 60, printHours: 4, handsOnMinutes: 15, stockOnHand: 6, kitEligible: false, sortOrder: 2,
    footprintMm: { x: 112, y: 86 }, heightMm: 58, printMinutes: 240, colours: ['matte-black'], supportsRequired: true,
    ipStatus: 'generic-functional', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "A wall hook shaped for a helmet. No brand, no character, no copied mechanism.",
  },
  {
    sku: 'BP-BK-003', slug: 'custom-bike-nameplate', name: 'Custom Bike Nameplate',
    categorySlug: 'biker', listPrice: 899, tags: ['custom', 'personalised', 'garage', 'gift'],
    shortDescription: 'Your name or registration, printed as a raised two-colour plate.',
    description: 'Send the text at checkout and it gets printed as raised lettering in a contrast colour. Made to order, so allow a few days.',
    filamentGrams: 80, printHours: 5, handsOnMinutes: 27, stockOnHand: 0, madeToOrder: true, leadTimeDays: 5, sortOrder: 3,
    footprintMm: { x: 180, y: 62 }, heightMm: 10, printMinutes: 300, colours: ['matte-black', 'white'], supportsRequired: false,
    ipStatus: 'personalised', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "Buyer supplies the text. Refuse orders whose text is a brand name or logo - personalisation does not launder a trademark.",
  },
  {
    sku: 'BP-BK-004', slug: 'number-plate-keyring', name: 'Number Plate Keyring',
    categorySlug: 'biker', listPrice: 349, tags: ['custom', 'keyring', 'personalised', 'gift'],
    shortDescription: 'Miniature of your own registration plate, on a keyring.',
    description: 'The plate everyone photographs, shrunk to pocket size. Two-colour print, your registration in raised black on white.',
    filamentGrams: 22, printHours: 1.3, handsOnMinutes: 12, stockOnHand: 0, madeToOrder: true, leadTimeDays: 4, kitEligible: true, sortOrder: 4,
    footprintMm: { x: 56, y: 28 }, heightMm: 5, printMinutes: 78, colours: ['white', 'matte-black'], supportsRequired: false,
    ipStatus: 'personalised', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "Buyer's own registration. Plain plate format only; no state emblems or manufacturer marks on the plate.",
  },

  // --- Tabletop ------------------------------------------------------------
  {
    sku: 'BP-TT-001', slug: 'mini-bike-desk-model', name: 'Mini Bike Desk Model',
    categorySlug: 'tabletop', listPrice: 1499, tags: ['display', 'desk', 'multi-part', 'gift'],
    shortDescription: 'Multi-part desk model, assembled and finished by hand.',
    description: 'Printed across several plates, cleaned up and assembled here. The centrepiece of the range — slow to make, which is why there is never much stock.',
    filamentGrams: 150, printHours: 9, handsOnMinutes: 48, stockOnHand: 3, featured: true, sortOrder: 1,
    footprintMm: { x: 148, y: 58 }, heightMm: 82, printMinutes: 540, colours: ['matte-black', 'silver', 'red'], supportsRequired: true,
    ipStatus: 'original', sellableVerdict: 'caution', modelSource: "Own CAD (planned)",
    ipNotes: "A scale model of a recognisable production bike. Manufacturers license scale models; keep it a generic sport-tourer or get permission before selling it as a specific bike.",
  },
  {
    sku: 'BP-TT-002', slug: 'articulated-flexi-dragon', name: 'Articulated Flexi Dragon',
    categorySlug: 'tabletop', listPrice: 699, tags: ['flexi', 'articulated', 'toy', 'gift', 'desk'],
    shortDescription: 'Prints in one piece, every joint moves, nothing to assemble.',
    description: 'Comes off the printer already articulated — no glue, no pins. The fidget toy that sells itself when someone picks it up.',
    filamentGrams: 45, printHours: 3, handsOnMinutes: 18, stockOnHand: 11, featured: true, kitEligible: true, sortOrder: 2,
    footprintMm: { x: 165, y: 70 }, heightMm: 32, printMinutes: 180, colours: ['teal'], supportsRequired: false,
    ipStatus: 'licensed-commercial', sellableVerdict: 'caution', modelSource: "MakerWorld / Cults3D (choose design)",
    ipNotes: "Popular flexi dragons are sold under paid commercial tiers. Buy the tier, record the reference here, and check the terms allow selling prints.",
  },
  {
    sku: 'BP-TT-003', slug: 'hex-dice-tower', name: 'Hex Dice Tower',
    categorySlug: 'tabletop', listPrice: 899, tags: ['games', 'desk', 'display'],
    shortDescription: 'Collapsible dice tower with internal baffles.',
    description: 'Internal baffles randomise the roll properly. Packs flat between game nights.',
    filamentGrams: 95, printHours: 6, handsOnMinutes: 22, stockOnHand: 4, sortOrder: 3,
    footprintMm: { x: 92, y: 80 }, heightMm: 165, printMinutes: 360, colours: ['matte-black', 'gold'], supportsRequired: true,
    ipStatus: 'generic-functional', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "A dice tower is a generic tabletop accessory. Keep game logos and named-system iconography off it.",
  },
  {
    sku: 'BP-TT-004', slug: 'desk-caddy-pen-key', name: 'Desk Caddy for Pens & Keys',
    categorySlug: 'tabletop', listPrice: 549, tags: ['desk', 'storage', 'organiser'],
    shortDescription: 'Two-compartment caddy with a slot sized for a bike key fob.',
    description: 'One well for pens, one shallow tray for keys and coins, with a cut-out that actually fits a bike key fob.',
    filamentGrams: 70, printHours: 4.5, handsOnMinutes: 14, stockOnHand: 8, kitEligible: true, sortOrder: 4,
    footprintMm: { x: 120, y: 95 }, heightMm: 70, printMinutes: 270, colours: ['grey'], supportsRequired: false,
    ipStatus: 'generic-functional', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "Desk organiser with no brand or character. Lowest-risk category.",
  },

  // --- Daily Fixes ---------------------------------------------------------
  {
    sku: 'BP-DL-001', slug: 'cable-clip-set-six', name: 'Cable Clip Set (6)',
    categorySlug: 'daily', listPrice: 199, tags: ['cable', 'organiser', 'desk', 'set'],
    shortDescription: 'Six adhesive-backed clips in three sizes.',
    description: 'Three sizes so charger, earphone and data cables each get the right grip. Adhesive pads included.',
    filamentGrams: 24, printHours: 1.5, handsOnMinutes: 10, stockOnHand: 30, kitEligible: true, sortOrder: 1,
    footprintMm: { x: 108, y: 36 }, heightMm: 12, printMinutes: 90, colours: ['matte-black'], supportsRequired: false,
    ipStatus: 'generic-functional', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "Generic cable clips. Lowest-risk category and among the best margins.",
  },
  {
    sku: 'BP-DL-002', slug: 'under-desk-headphone-hook', name: 'Under-Desk Headphone Hook',
    categorySlug: 'daily', listPrice: 249, tags: ['desk', 'storage', 'organiser'],
    shortDescription: 'Clamps under any desk edge, no screws, no adhesive.',
    description: 'Friction-fit to the desk edge, so nothing is drilled and nothing peels off in summer. Holds a full-size pair.',
    filamentGrams: 28, printHours: 1.8, handsOnMinutes: 9, stockOnHand: 18, kitEligible: true, sortOrder: 2,
    footprintMm: { x: 86, y: 64 }, heightMm: 38, printMinutes: 108, colours: ['matte-black'], supportsRequired: true,
    ipStatus: 'generic-functional', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "Generic under-desk hook. Describe compatibility in words; no headphone brand logos.",
  },
  {
    sku: 'BP-DL-003', slug: 'self-watering-mini-planter', name: 'Self-Watering Mini Planter',
    categorySlug: 'daily', listPrice: 399, tags: ['planter', 'desk', 'gift'],
    shortDescription: 'Two-part planter with a reservoir that lasts about a week.',
    description: 'The inner pot wicks from a reservoir below, so a desk plant survives a weekend away.',
    filamentGrams: 52, printHours: 3.4, handsOnMinutes: 12, stockOnHand: 9, sortOrder: 3,
    footprintMm: { x: 96, y: 96 }, heightMm: 105, printMinutes: 204, colours: ['white', 'teal'], supportsRequired: false,
    ipStatus: 'generic-functional', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "Generic planter. Self-watering wick planters are a common, unpatented form.",
  },
  {
    sku: 'BP-DL-004', slug: 'bottle-opener-keyring', name: 'Bottle Opener Keyring',
    categorySlug: 'daily', listPrice: 299, tags: ['keyring', 'gift', 'pocket'],
    shortDescription: 'Printed in PETG so it actually survives being used.',
    description: 'PETG rather than PLA, because a PLA opener snaps on the third bottle. Slim enough to live on a keyring.',
    filamentGrams: 20, printHours: 1.2, handsOnMinutes: 8, stockOnHand: 22, kitEligible: true, sortOrder: 4,
    footprintMm: { x: 64, y: 26 }, heightMm: 6, printMinutes: 72, colours: ['silver'], supportsRequired: false,
    ipStatus: 'generic-functional', sellableVerdict: 'yes', modelSource: "",
    ipNotes: "Generic keyring opener. No beer brand marks on the part or the photos.",
  },
];

const schedules = [
  {
    name: 'Small Items Volume',
    type: 'range',
    active: true,
    notes: 'Applies to keyrings and clips. Whole quantity gets the tier it lands in.',
    tiers: [
      { lowerBound: 1, upperBound: 3, discountPercent: 0 },
      { lowerBound: 3, upperBound: 6, discountPercent: 10 },
      { lowerBound: 6, upperBound: null, discountPercent: 20 },
    ],
  },
  {
    name: 'Bulk Slab (events)',
    type: 'slab',
    active: true,
    notes: 'For bike-meet orders. Each band is priced separately, so the discount grows gradually instead of jumping.',
    tiers: [
      { lowerBound: 1, upperBound: 11, discountPercent: 0 },
      { lowerBound: 11, upperBound: 26, discountPercent: 10 },
      { lowerBound: 26, upperBound: 51, discountPercent: 18 },
      { lowerBound: 51, upperBound: null, discountPercent: 25 },
    ],
  },
];

const rules = [
  {
    name: 'Launch offer — Bike & Rider 10%',
    description: 'Introductory discount on the biker range while the channel announcement runs.',
    scope: 'line',
    active: true,
    priority: 10,
    conditionLogic: 'all',
    conditions: [{ field: 'categorySlug', operator: 'equals', value: 'biker' }],
    actions: [{ type: 'percentDiscount', value: 10, label: 'Launch offer' }],
  },
  {
    name: 'Free shipping over 999',
    description: 'Pushes the average order value past the point where shipping stops hurting.',
    scope: 'order',
    active: true,
    priority: 20,
    conditionLogic: 'all',
    conditions: [{ field: 'subtotal', operator: 'greaterOrEqual', value: 999 }],
    actions: [{ type: 'freeShipping', value: 0, label: 'Free shipping' }],
  },
  {
    name: 'Mix the ranges — 5% on 3+ items',
    description: 'Rewards a basket rather than a single purchase.',
    scope: 'order',
    active: true,
    priority: 30,
    conditionLogic: 'all',
    conditions: [{ field: 'lineCount', operator: 'greaterOrEqual', value: 3 }],
    actions: [{ type: 'percentDiscount', value: 5, label: 'Mixed basket' }],
  },
];

const coupons = [
  {
    code: 'BATPOD10',
    description: '10% off for channel viewers',
    discountType: 'percent',
    value: 10,
    minSubtotal: 499,
    maxDiscount: 150,
    active: true,
  },
  {
    code: 'FIRSTRIDE',
    description: 'Flat 100 off a first order',
    discountType: 'amount',
    value: 100,
    minSubtotal: 799,
    usageLimit: 200,
    active: true,
  },
];

/**
 * Three demo accounts, so the recommendation rail and the account pages have
 * something to show before a real customer exists. Obviously fake addresses on
 * a domain you control, and a shared throwaway password.
 *
 * Delete them before you take real orders: `npm run seed -- --no-users`
 * skips them, and the admin's customer list shows which are demo accounts.
 */
const DEMO_PASSWORD = 'batpod-demo-2026';

const users = [
  {
    email: 'demo.rider@batpodlabs.test',
    name: 'Demo Rider',
    interests: ['biker'],
    phone: '9000000001',
    address: { line1: '1 Test Lane', city: 'Pune', pincode: '411001' },
    note: 'Only cares about bike gear — the rail should be almost all biker.',
  },
  {
    email: 'demo.desk@batpodlabs.test',
    name: 'Demo Desk',
    interests: ['tabletop', 'daily'],
    phone: '9000000002',
    address: { line1: '2 Test Lane', city: 'Mumbai', pincode: '400001' },
    note: 'Two interests — the rail should mix both ranges rather than pick one.',
  },
  {
    email: 'demo.new@batpodlabs.test',
    name: 'Demo Newcomer',
    interests: [],
    phone: '9000000003',
    address: { line1: '', city: '', pincode: '' },
    note: 'No interests and no orders — should fall back to best sellers, labelled as such.',
  },
];


/**
 * Demo orders, so the plate planner has a queue to work with before the first
 * real customer arrives.
 *
 * `daysAgo` backdates the order, which is what drives the ageing half of the
 * urgency score. The mix is deliberate: marketplace orders with deadlines, an
 * old website order that has been waiting too long, and a large multi-unit
 * line that will not fit on one plate with everything else.
 */
const demoOrders = [
  {
    ref: 'BP-DEMO-1001', channel: 'amazon', channelDetail: 'FBM order 402-7781', status: 'placed', daysAgo: 1,
    customer: { name: 'A. Marketplace Buyer', phone: '+91 90000 00001', city: 'Mumbai', pincode: '400001' },
    lines: [{ slug: 'dominar-silhouette-keychain', quantity: 4 }, { slug: 'bottle-opener-keyring', quantity: 2 }],
  },
  {
    ref: 'BP-DEMO-1002', channel: 'etsy', channelDetail: 'Etsy #2290114', status: 'placed', daysAgo: 2,
    customer: { name: 'J. Etsy Buyer', phone: '+91 90000 00002', city: 'Bengaluru', pincode: '560001' },
    lines: [{ slug: 'articulated-flexi-dragon', quantity: 2 }],
  },
  {
    ref: 'BP-DEMO-1003', channel: 'youtube', channelDetail: 'Dominar build video', status: 'placed', daysAgo: 6,
    customer: { name: 'R. Subscriber', phone: '+91 90000 00003', city: 'Pune', pincode: '411001' },
    lines: [{ slug: 'matte-helmet-wall-hook', quantity: 1 }, { slug: 'cable-clip-set-six', quantity: 1 }],
  },
  {
    ref: 'BP-DEMO-1004', channel: 'instagram', channelDetail: 'Reel comment', status: 'printing', daysAgo: 3,
    customer: { name: 'S. Follower', phone: '+91 90000 00004', city: 'Pune', pincode: '411014' },
    lines: [{ slug: 'number-plate-keyring', quantity: 3 }],
  },
  {
    ref: 'BP-DEMO-1005', channel: 'website', channelDetail: '', status: 'placed', daysAgo: 9,
    customer: { name: 'M. Patient Customer', phone: '+91 90000 00005', city: 'Nashik', pincode: '422001' },
    lines: [{ slug: 'desk-caddy-pen-key', quantity: 1 }, { slug: 'under-desk-headphone-hook', quantity: 2 }],
  },
  {
    ref: 'BP-DEMO-1006', channel: 'bike-meet', channelDetail: 'Sunday Khandala ride', status: 'placed', daysAgo: 4,
    customer: { name: 'K. Rider', phone: '+91 90000 00006', city: 'Lonavala', pincode: '410401' },
    lines: [{ slug: 'dominar-silhouette-keychain', quantity: 6 }],
  },
  {
    ref: 'BP-DEMO-1007', channel: 'partner-api', channelDetail: 'Partner: Gearhouse', status: 'placed', daysAgo: 1,
    customer: { name: 'Gearhouse Retail', phone: '+91 90000 00007', city: 'Delhi', pincode: '110001' },
    lines: [{ slug: 'cable-clip-set-six', quantity: 5 }, { slug: 'bottle-opener-keyring', quantity: 4 }],
  },
  {
    ref: 'BP-DEMO-1008', channel: 'whatsapp', channelDetail: 'Gift order', status: 'placed', daysAgo: 7,
    customer: { name: 'P. Gifter', phone: '+91 90000 00008', city: 'Pune', pincode: '411038' },
    lines: [{ slug: 'hex-dice-tower', quantity: 1 }, { slug: 'self-watering-mini-planter', quantity: 1 }],
  },
];

module.exports = { categories, products, schedules, rules, coupons, users, demoOrders, DEMO_PASSWORD };
