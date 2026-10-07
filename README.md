# batpod-server

**Live API:** https://batpod-sever.vercel.app

Health check: [/api/health](https://batpod-sever.vercel.app/api/health)

The API and the pricing engine. The shop and the admin both talk to this and nothing else — there is one database, one price calculation, one source of truth.

## What's inside

```
api/index.js          Vercel serverless entry — just exports the Express app
src/app.js            Express app, CORS, error handling
src/db.js             Cached Mongoose connection (important on serverless)
src/models/           Category, Product, DiscountSchedule, PriceRule, Coupon, Order
src/pricing/engine.js The CPQ calculator — pure functions, no database
src/routes/           catalog (public), quote (public), orders, admin
src/seed-data.js      The starter catalog
src/seed.js           Loads it into MongoDB
```

## Running it locally

```bash
npm install
cp .env.example .env     # then fill in MONGODB_URI and ADMIN_KEY
npm run seed             # loads 3 categories, 12 products, rules and coupons
npm run dev              # http://localhost:4000
```

Check it came up: `curl http://localhost:4000/api/health`

## Tests

```bash
npm test                 # pricing engine + seeded catalog
```

These need no database. `test:pricing` checks the engine against hand-worked numbers; `test:catalog` runs your real seed catalog through it, so if you change a price or a tier and a total moves, a test tells you.

## The pricing engine

Calculation order, deliberately the same as Salesforce CPQ so the result is explainable:

1. **List price** — the product's MRP
2. **Discount schedule** — volume tiers, `range` or `slab`
3. **Line price rules** — conditions and actions, by priority
4. **Line total** — net unit price × quantity
5. **Order price rules** — cart-level conditions and actions
6. **Coupon** — last, on the already-discounted subtotal

Every step appends to that line's `adjustments` array, so the cart can show the customer exactly which discount applied and the admin can see which rule fired.

**Range vs slab**, with tiers 1–10 at 0%, 11–25 at 10%, 26+ at 18%, on 40 units:

- `range` — all 40 units get 18%
- `slab` — 10 units at 0%, 15 at 10%, 15 at 18%

Range is what customers expect. Slab protects your margin on big orders. Both are in the seed so you can compare them in the admin's quote tester.

## API

Public:

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | Liveness check |
| GET | `/api/categories` | Categories with product counts |
| GET | `/api/products` | `?category=&tag=&q=&sort=&limit=&page=` |
| GET | `/api/products/:slug` | Product **plus** its related and cross-sell rails |
| POST | `/api/products/by-slugs` | Bulk fetch, used by cart and recently-viewed |
| POST | `/api/quote` | Prices a basket. The cart never computes its own prices |
| POST | `/api/orders` | Creates an order (prices recalculated server-side) |
| GET | `/api/orders/:reference` | Order lookup |

Admin — all need the `x-admin-key` header:

| Method | Path | What it does |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/admin/{products,categories,schedules,rules,coupons,orders}` | CRUD |
| PATCH | `/api/admin/stock/:id` | Fast stock and visibility toggle |
| POST | `/api/admin/quote-test` | Quote with the full rule trail |
| GET | `/api/admin/dashboard` | Counts, low stock, recent orders |

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo, leave every build setting at its default — `vercel.json` already routes everything to `api/index.js`.
3. Add environment variables (Settings → Environment Variables), for Production **and** Preview:

| Name | Value |
|---|---|
| `MONGODB_URI` | Your Atlas connection string |
| `ADMIN_KEY` | A long random string |
| `ALLOWED_ORIGINS` | `https://your-shop.vercel.app,https://your-admin.vercel.app` |
| `DEFAULT_SHIPPING_FEE` | `60` |

4. Deploy, then open `https://your-server.vercel.app/api/health`.

In MongoDB Atlas, under **Network Access**, allow `0.0.0.0/0`. Vercel's functions have no fixed IP addresses, so there is nothing narrower to allow. Your database is still protected by its username and password — make them strong.

Run the seed against the production database once, from your own machine, with `MONGODB_URI` pointed at Atlas.

## Things to know

**`ADMIN_KEY` is a stopgap, not authentication.** Anyone who has the key has full write access to the catalog. It is fine while you are the only one using the admin. When you add real login, replace `src/middleware/adminAuth.js` and nothing else has to change.

**Cold starts.** The first request after a quiet period takes a second or two while the function boots and connects to Atlas. `src/db.js` caches the connection so subsequent requests reuse it. Do not remove that caching — without it, a busy day exhausts Atlas's connection limit.

**Prices come from the server, always.** `POST /api/orders` ignores any price in the request body and recalculates from the slugs and quantities. A tampered cart cannot buy anything cheaply.

---

## Custom print estimator

A second product sitting on the same server: someone brings their own model and gets a price.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/custom/options` | Every valid dropdown value, file types, size cap. A partner's UI starts here so it never offers something the engine rejects |
| POST | `/api/custom/estimate` | Stateless. Nothing saved, nothing emailed — call it on every keystroke |
| POST | `/api/custom/requests` | Customer wants it made. Recalculates server-side, stores the lead |
| GET | `/api/custom/requests/:reference` | Customer checks back |

The estimator lives in `src/pricing/customEstimate.js` and is a pure function with 20 tests (`npm run test:estimate`).

**It deliberately over-estimates.** Nobody can price a mesh they have not sliced. Quoting low and asking for more later is the fastest way to lose a customer, so the quote is a range carrying ~18% headroom, presented as a ceiling that usually comes down.

**The file is never uploaded.** Only its name, size and type are sent. Accepting real uploads means storage, virus scanning and a privacy policy, none of which exist yet — the customer emails the model once there is a price they like.

**The mesh path is already in the contract.** Pass `mesh: { volumeCm3 }` instead of `size` and it uses real geometry. When STL parsing is added, the request and response shapes do not change — which matters because other people will have integrated against them by then.

### Partner access

Other print shops can call the estimator with an `x-api-key` issued from the admin. Until `REQUIRE_PARTNER_KEY=true` the endpoint is open. Issue keys first, flip the flag second, or you break your own website while nobody holds a key.

## Payback

`GET /api/admin/payback` answers "is this worth buying". It works out what the shop actually earns per month — real revenue minus what those products cost to make, using the same costing assumptions as everything else — and divides each purchase by it.

With no orders yet the real figure is zero, which is honest rather than useless: pass `assumedMonthlyProfit` and it models your guess instead, flagged as a guess in the response.

Query params: `assumedMonthlyProfit`, `lookbackDays` (default 90), `hypotheticalCost`.
