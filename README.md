# batpod-server

**Live API:** https://batpod-sever.vercel.app (the typo in the hostname is historical; leave it)
**Health check:** https://batpod-sever.vercel.app/api/health
**Repo:** https://github.com/PrateekEditor/batpod-sever

The API and the pricing engine behind [Batpod Labs](https://batpodshop.vercel.app), a 3D-printing shop in Pune running on a Bambu Lab A1 Combo. The shop ([batpod-shop](https://github.com/PrateekEditor/Batpod-shop)) and the admin ([batpod-admin](https://github.com/PrateekEditor/batpod-admin)) both talk to this and nothing else: one database, one price calculation, one source of truth.

If you are an AI assistant working in this repo, read `CLAUDE.md` first — it has the conventions and the gotchas.

## Stack

| Piece | What | Why |
|---|---|---|
| Node 20 + [Express 4](https://expressjs.com/) | HTTP | Small, well known, runs the same locally and as one Vercel function |
| [Mongoose 8](https://mongoosejs.com/) on [MongoDB Atlas](https://www.mongodb.com/atlas) (free M0) | Database | Flexible documents for a catalog that changes often; free tier is plenty |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | Customer accounts | Stateless sessions (no session store needed on serverless), slow hashes |
| [Vercel](https://vercel.com/docs/functions) serverless | Hosting | Free, zero-ops; `api/index.js` exports the Express app, `vercel.json` rewrites everything to it |
| Plain `node:assert` tests | Tests | No framework; every test file is a script you can read top to bottom |

No TypeScript, no build step, no ORM migrations. CommonJS throughout.

## What's inside

```
api/index.js              Vercel entry — exports the Express app
src/dev.js                Local entry — listens on PORT
src/app.js                Express app: CORS, status gate, routes, error handler
src/db.js                 Cached Mongoose connection (one per warm function)
src/shopStatus.js         Open / paused / maintenance switch with a 10 s cache
src/middleware/
  adminAuth.js            x-admin-key header check for /api/admin/*
  auth.js                 Bearer JWT → req.user (customer accounts)
  rateLimit.js            In-memory per-IP limiter (signup, login)
src/models/               Category, Product, DiscountSchedule, PriceRule, Coupon,
                          Order, User, QuoteRequest, PartnerKey, Purchase, ShopStatus
src/pricing/
  engine.js               The CPQ calculator — pure functions, no database
  costing.js              Cost model shared by margins, payback and the estimator
  customEstimate.js       Price a custom print from dimensions/weight before slicing
src/catalog/ip.js         Design-rights classification: what may be sold
src/printing/planner.js   Packs orders onto A1 build plates (print queue)
src/recommend.js          "Picked for you" — interests, recently viewed, popularity
src/routes/
  catalog.js              GET categories, products, recommendations (public)
  quote.js                POST /api/quote (public; cart pricing)
  orders.js               POST /api/orders, GET /api/orders/:reference (tracking)
  custom.js               Custom print options, estimates and requests
  auth.js                 Signup, login, profile, own orders
  admin.js                CRUD for every model + dashboard, print queue, status
src/seed-data.js          The starter catalog: 4 ranges, 17 products, rules, coupons
src/seed.js               Loads it into MongoDB (wipes catalog collections first)
```

## Running it locally

```bash
npm install
cp .env.example .env        # fill in MONGODB_URI, ADMIN_KEY, JWT_SECRET
npm run seed                # loads the catalog
npm run dev                 # runs the tests, then http://localhost:4000 with --watch
```

`npm run dev:fast` skips the tests. Check it came up: `curl http://localhost:4000/api/health`.

From the workspace root (`~/Downloads/batpod`) there is a launcher: `npm run server`, `npm run seed`, `npm run dev` (all three apps at once).

## Tests

```bash
npm test
```

Eight suites, no database needed, ~2 seconds:

| Suite | Checks | What it protects |
|---|---|---|
| `test:pricing` | 19 | Engine against hand-worked numbers; range vs slab tiers; rule priority; coupon last |
| `test:catalog` | 11 | The real seed catalog through the engine — a price change that moves a total fails a test |
| `test:estimate` | 20 | Custom-print estimator: buffers, minimums, material multipliers |
| `test:recommend` | 15 | Recommendation ordering and de-duplication |
| `test:planner` | 47 | Plate packing: fits the A1 bed, respects AMS colour limit, whole-order first |
| `test:ip` | 22 | Rights classification; only `licensed-commercial` / `own-design` are sellable |
| `test:status` | 7 | Shop status modes, message caps, `requireOpen` refusal |
| `test:auth` | 8 | Password rules, profile cleaning, consent stamping |
| `test:pincode` | 11 | Pincode parsing and cache, courier zones from Pune, Sunday-skipping delivery windows |

Each file is `node src/.../x.test.js` — a `check(name, fn)` helper, `assert`, a summary line. Add a check by copying one.

## Environment variables

Everything is in `.env.example` with a comment per line. The ones that matter:

| Variable | Used for |
|---|---|
| `MONGODB_URI` | Atlas connection string. The database name in the URI is the one used. |
| `ADMIN_KEY` | Shared secret the admin app sends as `x-admin-key`. Long and random. |
| `JWT_SECRET` / `JWT_TTL` | Customer sessions. Changing the secret signs everyone out. |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list. Blank = allow all (local only). Add every origin the shop or admin is served from — including `https://<you>.github.io` if you use GitHub Pages. |
| `DEFAULT_SHIPPING_FEE` | Rupees, before free-shipping rules. |
| `COST_*`, `PRINTER_HOURS_PER_DAY` | The cost model (filament ₹/g, electricity, labour, fail rate). Used by payback, dashboard margins and the estimator. |
| `CUSTOM_*` | Custom-print estimator margin, over-estimate buffer, setup minutes, max upload size. |
| `REQUIRE_PARTNER_KEY` | When `true`, `/api/quote` and `/api/orders` need a partner key. Leave `false` or you lock out your own shop. |

On Vercel, set the same variables under Project → Settings → Environment Variables, then redeploy.

## API

All JSON. Prices in rupees as numbers. Errors are `{ error: "…" }` with a sensible status; validation errors on signup also carry `field`.

### Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Uptime check, no DB |
| GET | `/api/status` | `{ mode, message, until, allowBrowsing, reachable }` — read **before** the DB gate so it answers even when Atlas is down |
| GET | `/api/categories` | With `productCount` and `accent` colour |
| GET | `/api/products?category=&sort=&page=&limit=` | Sellable products only (see IP below) |
| GET | `/api/products/:slug` | `{ product, related, crossSell }` |
| POST | `/api/products/by-slugs` | `{ slugs: [] }` → products, for the recently-viewed rail |
| GET | `/api/recommendations?recent=&limit=&exclude=` | Personalised when a Bearer token is sent |
| POST | `/api/quote` | `{ lines:[{slug,quantity}], couponCode }` → priced cart with an `adjustments` trail per line |
| POST | `/api/orders` | `{ customer, lines, couponCode, channel, channelDetail }` → `{ reference, total, status }`. Prices are recomputed server-side; the client's numbers are ignored. |
| GET | `/api/orders/:reference?phone=` or `?email=` | Tracking. The phone tail (last 4+ digits) or the exact email on the order is required; a reference alone returns 404. |
| GET/POST | `/api/custom/options`, `/api/custom/estimate`, `/api/custom/requests` | Custom print flow |
| GET | `/api/pincode/:pin?production=1` | City, state and a delivery window from the India Post directory (`src/pincode.js`); no DB, mounted above the gate |
| GET | `/api/images/:id` | A product photo's bytes, cached for a year |

`/api/quote` and `/api/orders` are behind `requireOpen`: when the shop is paused or in maintenance they return 503 with the status attached, and the shop shows the notice instead of a cart.

### Accounts (`/api/auth/*`)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | `{ email, password, name?, interests?, profile?, consent?, website? }` → `{ token, user, offer }`. `website` is a honeypot: filled = bot = fake 201. Rate-limited 10/15 min per IP. |
| POST | `/auth/login` | Same message for unknown email and wrong password. 20/15 min per IP. |
| GET / PATCH | `/auth/me` | Profile; PATCH accepts `name, phone, address, interests, profile, consent` |
| GET | `/auth/orders` | This account's orders |
| GET | `/auth/orders/:reference` | One order with its status history |

Password rules (`passwordProblem` in `routes/auth.js`): 8–128 chars, not on the common list, not containing the email's local part. The shop runs the same rules client-side (`lib/profile.js`) so the server copy is the one that counts.

### Admin (`/api/admin/*`, header `x-admin-key`)

Generic CRUD (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `?q=` search) for products, categories, schedules, rules, coupons, orders, purchases, requests, partner-keys. Plus:

| Path | What |
|---|---|
| `PUT /orders/:id` | Goes through `save()` so status changes land in `statusHistory` with a timestamp. Accepts `status, trackingNote, courierRef, notes, channel, channelDetail`. |
| `GET /users` | Customers |
| `PATCH /stock/:id` | Adjust stock without touching the rest of the product |
| `POST /quote-test` | Run a cart through the engine with a what-if |
| `GET /dashboard` | Revenue, margin, channel mix, top products |
| `GET /print-queue` | Orders packed onto plates by the planner |
| `GET /payback` | Printer payback from purchases + margins |
| `GET / PUT /status` | The shop switch: `open`, `paused`, `maintenance`, with message and optional `until` |
| `POST /generate-key` | Partner API keys |
| `POST/PUT/DELETE /products/:id/images` | Product photos: upload a compressed data URL (≤1.5 MB), reorder, remove. Stored in `ProductImage`, referenced from `product.images[]` as `/api/images/<id>` |

## The pricing engine

Calculation order, deliberately the same as Salesforce CPQ so the result is explainable:

1. **List price** — the product's MRP
2. **Discount schedule** — volume tiers, `range` or `slab`
3. **Line price rules** — conditions and actions, by priority
4. **Line total** — net unit price × quantity
5. **Order price rules** — cart-level conditions and actions
6. **Coupon** — last, on the already-discounted subtotal

Every step appends to that line's `adjustments` array, so the cart shows the customer which discount applied and the admin sees which rule fired.

**Range vs slab**, tiers 1–10 at 0%, 11–25 at 10%, 26+ at 18%, on 40 units: `range` gives all 40 units 18%; `slab` gives 10 at 0%, 15 at 10%, 15 at 18%. Range is what customers expect; slab protects margin on big orders. Both are seeded so the quote tester can compare them.

## Orders and tracking

An order's life is `draft → placed → printing → shipped → delivered` (or `cancelled`). The `pre('save')` hook on `Order` appends `{ status, at }` to `statusHistory` whenever the status changes — which is why admin updates go through `save()` and not `findByIdAndUpdate`. `trackingNote` (your words to the customer) and `courierRef` are shown on the customer's tracking page. `toTracking()` is the public shape: no customer details, no prices per line.

Orders record a `channel` (`website`, `instagram`, `youtube`, `whatsapp`, `bike-meet`, `amazon`, `etsy`, `partner-api`, `other`). The shop captures `?from=youtube` on arrival and sends it at checkout; marketplace channels are flagged priority in the admin because they carry dispatch deadlines.

There is no payment gateway yet. Orders are confirmed over WhatsApp and settled by UPI; the shop builds both links from `lib/site.js`. When a gateway is added (Razorpay is the obvious one for India), the place to hook it is a `POST /api/orders/:reference/pay` that creates the gateway order and a webhook that moves status `draft → placed`.

## Product photos

There is no file storage on Vercel, so photos live in Atlas: the admin resizes to 1200 px and compresses to WebP in the browser (60–150 KB each), posts a data URL, and the server stores the bytes in `ProductImage` and appends `/api/images/<id>` to `product.images`. Catalog responses carry only the URLs, so listings stay small; `GET /api/images/:id` serves with `Cache-Control: immutable`. The shop prefixes the API host (`imageSrc()` in `lib/api.js`). Eight photos per product at most. If photos ever outgrow this, move the bytes to Cloudinary or R2 and keep the same URL shape.

## Pincode and delivery window

`src/pincode.js` looks pincodes up on India Post's free directory API (`api.postalpincode.in`), caches for a day, and turns the state into a courier zone from Pune (Maharashtra 1–2 days … north-east 7–10). `estimate()` adds production days and skips Sundays. The checkout form fills city and state from it and shows the window; the same numbers are what to quote on WhatsApp.

## Design rights (what may be sold)

Most free models on MakerWorld, Printables and Thingiverse are non-commercial (Standard Digital File Licence or CC BY-NC). `src/catalog/ip.js` classifies every product by `ipStatus` (`own-design`, `licensed-commercial`, `non-commercial`, `unreviewed`) and `ipVerdict` (`ok`, `caution`, `blocked`); only `SELLABLE` ones reach the public catalog. The rights fields are `select: false` so they never leak through the public API; the admin asks for them explicitly. The Minis range is seeded as `licensed-commercial` / `caution` with a `modelSource` URL for each, so the verdict can be revisited.

## Shop status

`ShopStatus` is a single document. `getStatus()` caches it for 10 seconds; `/api/status` is registered *above* the database gate in `app.js` so a dead Atlas cluster still gets an answer (`reachable:false` from the shop's point of view comes from the request failing, not from this). Modes: `open`, `paused` (browsing allowed, no checkout), `maintenance` (full notice).

## Seed data

`src/seed-data.js` is the catalog. Edit it, run `npm run seed`, push. It wipes and recreates categories, products, schedules, rules and coupons; it leaves orders, users and purchases alone. SKUs: `BP-BK-*` Bike & Rider, `BP-TT-*` Tabletop, `BP-DF-*` Daily Fixes, `BP-MN-*` Minis.

## Deploying to Vercel

1. Import the GitHub repo in Vercel; framework preset "Other"; no build command.
2. Add the environment variables from `.env.example`.
3. Atlas → Network Access → allow `0.0.0.0/0` (serverless has no fixed IP).
4. Push to `main`; Vercel deploys. Run `npm run seed` locally against the production URI once.

`src/db.js` caches the connection on the module scope so a warm function reuses it. Cold starts are ~1 s on the free tier.

## Customising

- **New range:** add a category and products to `seed-data.js`, re-seed, add the slug to `KNOWN` in the shop's `app/c/[slug]/page.jsx` and `RANGES` in `lib/profile.js`, add a scene in `components/scenes/Scenes.jsx`.
- **Prices and discounts:** in the admin (Products, Discount schedules, Price rules, Coupons) — no code.
- **Cost assumptions:** `.env` `COST_*`.
- **Order statuses:** `STATUSES` in `models/Order.js`, mirrored in the shop's `OrderTimeline.jsx` and admin's `Orders.jsx`.
- **Rate limits:** `signupLimit` / `loginLimit` in `routes/auth.js`. In-memory, so per function instance on Vercel; good enough against casual abuse, not a DDoS tool.
- **Profile questions:** `profile` sub-schema in `models/User.js` and `cleanProfile` in `routes/auth.js`; the shop's `lib/profile.js` lists the same choices.

## References used while building this

- Salesforce CPQ price calculation order — the model for the engine
- Express 4 docs — https://expressjs.com/en/4x/api.html
- Mongoose 8 docs (middleware, `select:false`) — https://mongoosejs.com/docs/
- Vercel Express guide — https://vercel.com/guides/using-express-with-vercel
- MongoDB Atlas free tier — https://www.mongodb.com/pricing
- OWASP password storage & authentication cheat sheets — https://cheatsheetseries.owasp.org/
- Bambu Lab A1 build volume (256 × 256 × 256 mm) and AMS lite (4 slots) — https://wiki.bambulab.com/en/a1
- MakerWorld / Printables / Thingiverse licence terms (for `catalog/ip.js`) — https://makerworld.com/en/terms, https://www.printables.com/terms, https://creativecommons.org/licenses/
- NPCI UPI deep-link spec (for the shop's pay link) — https://www.npci.org.in/what-we-do/upi/product-overview
- WhatsApp click-to-chat (`wa.me`) — https://faq.whatsapp.com/5913398998672934
- Razorpay (future payments) — https://razorpay.com/docs/
