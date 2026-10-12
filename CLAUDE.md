# CLAUDE.md — batpod-server

Guidance for AI assistants (Claude Code, Cursor, Copilot, anyone) working in this repo. The README explains what the system is; this file explains how to change it without breaking it.

## The one-paragraph picture

Express API + Mongoose on Atlas, deployed as a single Vercel function. Serves a Next.js shop (`batpod-shop`) and a Vite admin (`batpod-admin`). The pricing engine in `src/pricing/engine.js` is pure and tested; every price the customer sees is computed here, never in the client. Orders are confirmed over WhatsApp and paid by UPI for now — no gateway.

## Commands

```bash
npm install
npm run seed            # needs MONGODB_URI in .env; wipes catalog collections, keeps orders/users
npm run dev             # tests first, then node --watch on :4000
npm run dev:fast        # skip tests
npm test                # all eight suites, no DB, ~2 s
node src/routes/auth.test.js   # any single suite is just a script
```

The owner runs commands in a numbered terminal (1 = server, 2 = shop, 3 = admin, 4 = anything else). When you give him a command, say which terminal. **Never put `# comments` on a command line** — his zsh passes `#` as an argument and npm fails with `EINVALIDTAGNAME`.

## Conventions

- CommonJS, no build step, no TypeScript. Node 20.
- Prices are rupees, numbers, rounded with `Math.round` at the edges. Never floats in storage for money.
- Every route returns JSON; errors are `{ error }` and go through `next(err)` to the handler in `app.js`.
- Public reads live in `routes/catalog.js`; anything that writes needs either the customer JWT (`middleware/auth.js`) or the admin key (`middleware/adminAuth.js`).
- Tests are plain scripts with a `check(name, fn)` helper and `node:assert`. When you add behaviour, add a check to the nearest `*.test.js` and wire a new file into the `test` script in `package.json`.
- Comments explain *why*. The code already says what.

## Things that will bite you

1. **`findByIdAndUpdate` skips Mongoose hooks.** `Order.pre('save')` writes `statusHistory`. The admin order route uses `order.save()` on purpose; keep it that way for anything with hooks.
2. **Rights fields are `select: false`.** `ipStatus`, `ipVerdict`, `ipNotes`, `modelSource`, `licence` never appear in a query unless you `.select('+ipStatus …')`. The public catalog filters by `SELLABLE` using `catalog/ip.js`; the admin `PRODUCT_ADMIN_SELECT` string in `routes/admin.js` adds them back. If a new product shows up in the admin but not the shop, this is why.
3. **`/api/status` must stay above the DB gate in `app.js`.** The shop polls it to decide whether the API is reachable; moving it below the connection middleware turns an Atlas outage into a "shop unreachable" screen with no message.
4. **`requireOpen` guards `/api/quote` and `/api/orders`** (mounted before the routers). A paused shop must still serve `/api/categories` so browsing works.
5. **`routes/auth.js` exports `{ router, passwordProblem, cleanProfile, cleanConsent }`**, not the router directly. `app.js` destructures it. If you add a route file, export the router plainly unless its helpers need testing.
6. **Rate limiting is in-memory** (`middleware/rateLimit.js`), keyed `ip:path`. On Vercel each instance has its own map. Fine for abuse control; don't rely on it for correctness.
7. **The seed is destructive for catalog collections.** Run it after changing `seed-data.js` and tell the owner to run it before pushing when the DB shape changes. It cannot run from a sandbox that lacks DNS SRV lookup (`querySrv ECONNREFUSED`) — the owner runs it in terminal 4.
8. **Mirror lists exist in the clients.** Order statuses, interest slugs (`biker, tabletop, daily, minis`), profile choices (`rides`, `useFor`, `contactPref`), password rules. When you change one here, change `batpod-shop/lib/profile.js`, `batpod-shop/components/OrderTimeline.jsx` and `batpod-admin/src/pages/Orders.jsx`.
9. **The planner assumes the A1:** 256 mm bed, 4 AMS slots, one plate at a time. Constants at the top of `printing/planner.js`.
10. **Photo uploads** go through `express.json({ limit: '6mb' })` mounted on `/api/admin/products/:id/images` *before* the global 1 MB parser (body-parser skips an already-parsed body). Keep that order.
11. **`/api/pincode` is above the DB gate** like `/api/status`; it must not import a model.
12. **CORS**: `ALLOWED_ORIGINS` blank allows everything, which is only right locally. Production must list the shop and admin origins, including a `github.io` origin if GitHub Pages is used.

## Where to add things

| Want to… | Touch |
|---|---|
| Add a public read endpoint | `routes/catalog.js` (cached by the shop for 60 s via `next.revalidate`) |
| Add a customer-only endpoint | `routes/auth.js`, use `requireAuth` |
| Add an admin endpoint | `routes/admin.js` — put specific routes *before* the `crud(...)` mounts or the generic `/:id` swallows them |
| Change a model | `models/*.js`, then `seed-data.js` if seeded, then `npm run seed`, then the clients |
| Change pricing | `pricing/engine.js` + `engine.test.js` + `catalog.test.js` (hand-worked numbers, not snapshots) |
| Change the cost model | `pricing/costing.js` reads `COST_*` env; `.env.example` documents them |
| Add a payment gateway | New `routes/payments.js`: create gateway order from an existing `Order`, verify webhook signature, `order.status = 'placed'; await order.save()`. Keep `/api/orders` creating the order first so the WhatsApp/UPI path keeps working. |
| Add an email/WhatsApp notification | A small `src/notify.js` called from the admin order PUT after `save()`; use `contactPref` on the user and `consent.marketing` before sending anything that is not about their order |

## Git

The owner commits are authored as `Prateek Patel <prateek.patel@bluvium.com>`. Assistants commit; the owner pushes. Commit messages: a short title, then a paragraph on *why*, then attribution lines if the tooling asks for them.

## Related repos

- Shop: https://github.com/PrateekPatelBluvium9878/Batpod-shop → https://batpodshop.vercel.app
- Admin: https://github.com/PrateekPatelBluvium9878/batpod-admin
- Print calculator (standalone): https://github.com/PrateekPatelBluvium9878/batpod-printcalc
- Workspace launcher: `~/Downloads/batpod/package.json` (`npm run server|shop|admin|printcalc|dev|seed|test`)
