# Implementation progress

The running record for the 30-prompt desktop implementation
([`avyora-30-implementation-prompts.md`](avyora-30-implementation-prompts.md)).
The contract is
[`avyora-developer-implementation-specification-2026-10-07.md`](avyora-developer-implementation-specification-2026-10-07.md);
the defect register is
[`avyora-product-architecture-audit-2026-10-07.md`](avyora-product-architecture-audit-2026-10-07.md)
(audit IDs below refer to it).

Scope: **desktop website only.** Visual target: the live
https://nuve-beauty.framer.website/. Mobile and tablet remain deferred until the
owner finishes desktop testing.

---

## Prompt 1 — Build baseline (7 October 2026)

### Starting state

| Item | Value |
| --- | --- |
| Branch | `feat/customer-accounts` (PR #13 merged into `main`) |
| HEAD at start | `6114543` |
| Uncommitted at start | Owner-added, all untracked and left untouched: the specification (`.md`, `.docx`, `.pdf`), the audit, the 30-prompt plan, `audit-evidence-2026-10-07/`, `implementation-qa/`, `implementation-visuals/`, `redesign-reference/`, `implementation-verification.json`, `build_implementation_*.py`, `.agents/`, `skills-lock.json` |
| Repository instructions | No `AGENTS.md` or `CLAUDE.md` exists. `.agents/skills/` holds two Neon skills only. |
| Toolchain | Node 24.18.0, npm 12.0.2, Next.js 15, Vitest 4.1.11 |
| Machine | Windows 11, 8 logical CPUs, 15.4 GB RAM |
| Local database | `.env.local` points at `localhost:5433`, which is **not running** |
| Production | Live at https://avyora-beauty.vercel.app, functions in `sin1`, public pages served from ISR cache (`x-vercel-cache: STALE`), 0.2–0.35 s per page |

### Changes made

1. **Portable build** (audit #24). `npm run build` was
   `NODE_ENV=production next build`, Unix syntax that fails on Windows before
   compiling. It is now `next build`, which sets the production environment
   itself. Docker and CI call `npm run build` unchanged.
2. **Explicit build-time database policy** (audit #29). See the next section.
3. **The payment test timeout the audit saw.** In `state-machine.test.ts` (17
   tests, the file the audit reran), one test did `await import('../payment-service')`
   inside its body, so loading the database modules counted against its
   5-second limit. It took 2.6 s on an idle machine. The rule it tests
   (`shouldRetryUnknownOrder`) moved to a pure module,
   `src/modules/payments/webhook-policy.ts`, imported statically. That test now
   takes 0 ms. No timeout was raised.
4. **Test workers out of memory.** One full run lost two test files when their
   workers died with V8 `Fatal process out of memory: Zone`. Each integration
   file boots its own in-memory Postgres, and Vitest's default started seven
   workers. `vitest.config.ts` now sets `maxWorkers: 4`: same wall-clock time
   (39–46 s against 46–67 s), and no crash in three consecutive runs.

### Build-time database policy

Home, `/collections`, `/journal` and product pages are statically prerendered,
and read Postgres (stock, display prices, published articles) while doing so.

| Situation | Behaviour | Why |
| --- | --- | --- |
| `DATABASE_URL` set and reachable (Vercel production) | Normal build with real data | Verified: the live deployment of PR #13 serves prerendered pages from cache in `sin1` |
| `DATABASE_URL` set but **unreachable** | **Build fails** (`ECONNREFUSED` prerendering `/collections`) | Deliberate. A deployment must not bake an outage into cached pages: an empty journal, or every product shown as sold out. |
| No database available on purpose (CI, a laptop) | `npm run build:offline` | Runs `next build` with `DATABASE_URL` explicitly empty, which overrides `.env.local`. Pages render catalogue-only fallbacks. Verification only; the script refuses to run on Vercel. CI now uses it. |
| Vercel **production** build with no `DATABASE_URL` | **Build refused** in `next.config.ts` | Prevents a misconfigured deploy from publishing fallback pages as real |

Fallback reads that do **not** fail the build, because their fallback is real
content: product copy falls back to catalogue text, the sitemap omits articles
and logs the error, and recommendations drop to routine fit only.

To build locally against data instead, point `DATABASE_URL` in
`.env.development.local` at a Neon branch (never production).

### Baseline results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, **0 errors, 23 warnings**: 13 `no-explicit-any`, 8 `no-unused-vars`, 1 `react-hooks/exhaustive-deps`, 1 `import/no-anonymous-default-export`. Not changed in this prompt. |
| `npm test` | **42 files, 403/403 pass**, 39 s. Seven earlier runs: four passed with the old defaults, one lost two files to the out-of-memory crash, and two passed at 4 workers before the config change. |
| `npm run build` (local, unreachable DB) | **Fails as designed** at `/collections` prerender with `ECONNREFUSED`, after compiling successfully |
| `npm run build:offline` | **Pass**: 55 routes |
| Production guard | `VERCEL_ENV=production` with no `DATABASE_URL` stops the build with an explicit message |
| Stress suite (`npm run test:stress`) | Not rerun: needs a scratch database. Last run 25 Sep 2026: 8/8 (see `stress-testing.md`). |

### Route inventory (from the build)

**Public, static or ISR:** `/`, `/collections`, `/products/[slug]` (27
prerendered), `/journal`, `/journal/[slug]` (on demand), `/routine-finder`,
`/wishlist`, `/contact`, `/privacy`, `/terms`, `/shipping-policy`,
`/refund-policy`, `/sitemap.xml`, `/robots.txt`.

**Customer, dynamic:** `/login`, `/signup`, `/checkout`, `/track-order`,
`/orders/[orderNumber]`, `/orders/[orderNumber]/invoice`, `/account`,
`/account/orders`, `/account/addresses`, `/account/addresses/new`,
`/account/addresses/[id]/edit`, `/account/data`.

**Staff, dynamic:** `/admin-login`, `/admin`, `/admin/orders`,
`/admin/orders/[orderNumber]`, `/admin/inventory`, `/admin/pricing`,
`/admin/content`, `/admin/content/[type]/[slug]`, `/admin/content/media`,
`/admin/analytics`, `/admin/requests`, `/admin/system`, `/manager`,
`/manager/stock`, `/manager/requests`.

**API (12):** `/api/auth/[...nextauth]`, `/api/cart`, `/api/wishlist`,
`/api/account/deliver-to`, `/api/activity`, `/api/admin/login`,
`/api/admin/logout`, `/api/payments/razorpay/create`,
`/api/payments/razorpay/verify`, `/api/webhooks/razorpay`, `/api/cron/sweep`,
`/api/cron/events`.

### Feature inventory

| Area | Present | Known defects (audit) |
| --- | --- | --- |
| Catalogue | 27 products compiled into `src/data/mock-data.ts`; prices and stock in Postgres | No products table (prompt 5); highlights are not full INCI (#18) |
| Search and recommendations | In-memory ranked search; ingredient-conflict-aware recommendations | Raw co-purchase can overpower fit (#20) |
| Cart and wishlist | SKU-and-quantity lines, versioned storage, live quote; server wishlist for signed-in users | One-way mirror (#26, prompt 12) |
| Checkout and payments | Guarded stock reservation, idempotent orders, COD risk gate, Razorpay state machine, webhook dedupe, reconciliation | Razorpay keys not configured |
| Routine finder | Rule engine with exclusions before selection, tri-state pregnancy, essentials-first results | No approved treatment directions yet, so essentials only; ignored questions (#14); unvalidated saves (#15–#17); prose-only scheduling (#21) |
| Accounts | Google and email-code sign-in, addresses, orders, data page | — |
| Content | CMS with drafts, publish, revisions, media; journal | Uploads off without a bucket; CSP for media domain (#27) |
| Operations | Owner console, stockroom, audit log, job queue, dead letters and replay | — |
| Marketing copy | Banner, hero, routine panel, product copy; all derived from what checkout applies | Business details still unconfirmed (#10, see prompt 4); placeholder imagery (#22) |

No commerce or staff feature was removed or changed in this prompt.

### Outstanding dependencies

These block later prompts or a launch, and need the owner or a third party:

| Dependency | Needed for | Status |
| --- | --- | --- |
| Local or staging database | Data-backed builds, migration and stress verification | `localhost:5433` is not running; use a Neon branch |
| Approved product directions, full INCI, substantiated claims | Prompts 3, 4, 6 | Not in the repository |
| Verified business details (support phone, address, policies) | Prompt 4 | `[TO CONFIRM]` and a dummy WhatsApp number in public pages |
| Clinician-reviewed routine rules | Prompts 3, 9, 13–15 | None exist; rules stay explicit assumptions |
| Nuvē reference captures at 1280, 1440 and 1920 px; font licences (Inter, Instrument Serif) | Prompts 19–22 | **Captured** 8 Oct at 1280/1440/1920: `docs/redesign-reference/nuve-reference-2026-10-08.md` |
| Real brand assets and product photography | Prompts 20–22 | Logo and imagery are placeholders |
| Razorpay sandbox keys | Prompt 23 purchase tests | Not configured |
| Licensed, evaluated cosmetic image model | Prompt 27 | None; scan stays disabled |
| Promotion, loyalty and newsletter business rules | Prompt 29 | Undefined; features stay disabled |
| Object storage buckets, backup secrets | Media uploads, analytics export, nightly backup | Not configured |

---

## Prompt 2 — Cart variants, quantities and prices (7 October 2026)

### The defect, traced

The bag stored a **copy of the whole catalogue product** plus a quantity, and
every surface priced the line from that copy's base `price`, the first size's
price, frozen when the item was added. The product page also called
`addToCart(product, size)` with no quantity, and the store always added one.
So 90ml at quantity 3 became one unit at the 30ml price, and no admin override
or offer ever reached the bag. Checkout itself already charged correctly from
Postgres; the defect was in what the customer saw.

### Changes

| Area | Change |
| --- | --- |
| Pricing rule (`modules/catalog/sku-price.ts`) | Now database-free, so the bag runs the same rule as checkout. `resolvePrice` moved here (`lib/pricing` re-exports it). An unknown size now **throws** instead of silently pricing the first size. A product-level catalogue `salePrice` applies only to the size it describes (it applied to every size before; latent, no product has one today). |
| Cart model (`lib/cart.ts`, new) | A line is `{productId, size, quantity}`, never a product copy. Pure functions for adding (honours quantity, caps at known stock and 10 per SKU, never substitutes a size), validated parsing of stored data (current and legacy format, unknown SKUs and bad quantities dropped, duplicates merged), and pricing a line at its SKU's current quote, or the catalogue price for that size marked **unconfirmed**. |
| Store (`lib/store.tsx`) | Holds lines only; `addToCart(productId, size, quantity, available)` returns what was added and why not more. Storage moved to versioned `avyora.cart.v2` (the legacy `cart` key is migrated once). Every storage access is guarded, so a browser that blocks storage keeps an in-memory bag. Fixed the first render writing an empty cart over the saved one. New `clearCart()`. |
| Quote endpoint (`GET /api/catalog/availability`, new) | Current display prices and stock for at most 50 SKUs, with `quoteVersion` and `validUntil`; `stock` is null when there is no inventory to report. Short public cache. |
| Bag (`components/cart-drawer.tsx`, `lib/use-cart-quote.ts`) | Each line priced from the quote for its own SKU. "Checking current prices…" while loading, one retry, then "could not be confirmed". Lines over stock say so; `+` stops at stock or the cap. |
| Product page | Passes the selected size, quantity and that size's stock. The quantity selector is capped at what is available, a size change clamps the quantity, and a capped add explains itself. |
| Product cards, routine finder | Use the new cart API. Cards price the selected size through the shared rule. |
| Checkout page and client | Reads stock fresh alongside prices. Lines over stock are flagged and **Place order is disabled** until fixed. Each line sends the unit price shown (`expectedUnitPaise`). The bag is emptied after a confirmed order (it never was, so a customer who had just ordered was one click from ordering again). |
| Order creation (`lib/orders.ts`) | If a shown unit price no longer matches the current price, the order is refused with `code: 'price_changed'` **before** anything is reserved; the page refreshes its quote and shows the new figure. Optional field, so older clients still work. Idempotent replays are checked first. Razorpay session creation returns 409 with the same code. Stock reservation, idempotency and payment logic are unchanged. |

### Verification

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 22 warnings (one fewer than baseline) |
| Tests | **45 files, 430/430** (27 new: 18 cart, 5 checkout integration, 4 endpoint) |
| `npm run build:offline` | Pass; `/api/catalog/availability` builds as dynamic |
| Mutation checks | Removing the server price check fails the price-change test; pricing lines at the base price fails 3 cart tests |

New regression tests, with every expected amount derived from the catalogue
and pricing rule at test time, never hard-coded:

- 90ml at quantity 3 stays 90ml with 3 units; its subtotal is the current 90ml
  unit price × 3 and differs from the base price × 3; before a quote it uses
  the 90ml catalogue price, marked unconfirmed.
- Checkout with an owner override: order line is `90ml`, quantity 3, unit
  price = the override, line total = unit × 3, stock down by 3.
- Price raised after display: order refused with `price_changed`, no order,
  stock untouched; accepted once the new price is shown.
- Stock limits: adding caps at stock (including what is already in the bag)
  and at 10 per SKU; sold-out adds nothing; checkout refuses 3 when 2 remain,
  naming the size, with stock untouched.
- Default variant, unknown sizes (never substituted), offers on one size only,
  stored data (round trip, legacy migration, junk, merges).

Browser run against a temporary Neon branch (production copy, email disabled,
an owner override of ₹949 on retinal 90ml set on the branch only):

| Step | Observed |
| --- | --- |
| Select 90ml, quantity 3, Add to Cart | Bag: one line, 90ml, quantity 3; storage `{retinol, 90ml, 3}` |
| Bag total | ₹2,847 (₹949 × 3, the override), confirmed; survives a reload |
| Raise price to ₹999 on the branch, then Place order | Refused: "changed from ₹949 to ₹999"; summary refreshed to ₹2,997; no order, stock unchanged (25) |
| Place order again | Order `AVY-ETBN7Z`: 90ml × 3 at ₹999, total ₹2,997; stock 25 → 22 |
| Branch stock set to 2, bag still 3 | "Only 2 available. Reduce the quantity to continue."; `+` and Place order disabled |
| Reduce to 2, place order | Order `AVY-NG8DP7` placed; bag emptied (header "0 items", storage empty) |
| Corrupt storage (bad JSON; a line with a nonexistent size) | Page works; bad JSON gives an empty bag; the invalid line is dropped, the valid one kept |

### Limitations and follow-ups

- The bag's quote is display-only and short-cached (15 s at the edge, 5 s in
  memory, 60 s in Redis). The checkout page and order creation read Postgres
  fresh, so a stale bag figure cannot become the charge.
- Server quantity validation still allows 20 per line (`checkoutSchema`); the
  storefront now caps at 10 per the specification. Aligning the server is
  left to prompt 10 (bounded inputs).
- The routine finder still adds `sizes[0]` when a step has no size and totals
  from catalogue prices (audit #12, #13): prompt 14.
- Server-cart restore and guest-to-user merge are prompt 12.
- The drawer's "free gift" progress bar is unimplemented marketing (audit #07):
  prompt 4.
- The temporary branch `cart-verify-prompt2` holds two test orders; awaiting
  deletion approval.

---

## Prompt 3 — Routine safety and beginner simplicity (7 October 2026)

### What was wrong (reproduced in the audit)

- Irritated skin: only the retinoid was removed; vitamin C and an exfoliant
  stayed beside a "barrier repair only" message (#01).
- "Prefer not to say" on pregnancy had the value `no`, so it counted as not
  pregnant, and its button lit up together with "No" (#02).
- Very reactive skin still got exfoliation and a multi-product routine (#11).
- A "simple routine" beginner got 6 morning and 6 evening steps, 9 products
  (#06).
- Every product showed generic "use twice daily" directions, the retinal
  ampoule included (#03).

### Changes

| Area | Change |
| --- | --- |
| Directions registry (`src/data/product-directions.ts`, new) | `APPROVED_DIRECTIONS` holds approved, product-specific directions (session, frequency, text, reviewer, date, source). **It is empty**: no reviewed directions exist in the repository. `TREATMENTS` classifies the catalogue's elective actives (retinoid, vitamin C, four exfoliants, niacinamide, peptide); the first three classes are marked elective-irritating. |
| Engine (`src/lib/routine-engine.ts`, rewritten) | Fixed order: normalise answers → mode (recovery if irritated, gentle if very reactive) → every treatment candidate passes every exclusion (mode, beginner, pregnancy, under 18, approved directions) → treatment limit → build sessions → explanations and warnings generated from what was actually chosen and omitted. |
| Pregnancy | Tri-state `yes` / `no` / `unknown`. Anything but an explicit yes or no (prefer not to say, skipped, old saved data) is unknown. Only `no` makes a retinoid eligible. |
| Recovery and very reactive | Cleanser, moisturiser and sunscreen only: no treatments and no optional additions. The cleanser switches to the centella balm, because the default gel cleanser's highlights list LHA (an exfoliating acid). |
| Beginners (no routine, or beginner) | Essentials only: morning cleanse, moisturise, protect (3); evening cleanse, moisturise (2). Cap enforced: `BEGINNER_SESSION_STEP_CAP = 3`. |
| Optional additions | Toner, essence, eye patches and exfoliation are never in the essential routine; they are listed separately, marked optional, priced outside the total, and left out of "Add essentials to bag". An exfoliant is offered only if it passes the same exclusions and never beside a retinoid. |
| Treatments | Enter a routine only with approved directions, shown verbatim (frequency and text). The engine's invented frequencies and the "Building up retinol" schedule are gone. One treatment at most for regular users and reactive skin; otherwise one per session. |
| "Not included yet" | Each omitted treatment is listed with its reason: irritated, very reactive, beginner, pregnancy (yes or unknown), under 18, directions pending, or treatment limit. |
| Copy | Step explanations describe the step's role, with no efficacy claims ("collagen", "cell turnover", "de-puff", "cellular repair" removed). Warnings and the explanation are generated from the decisions. |
| Unanswered reactivity | Now treated as `high` (reactive), not `low`. |
| Product pages | "How to Use" shows approved directions, then owner-published CMS directions, otherwise "Directions specific to this product are being reviewed…". No generic schedule remains. |
| Quiz | Questions moved to `src/app/routine-finder/questions.ts` so tests can check them. "Prefer not to say" has value `unknown`. Results show essentials, optional additions, and "Not included yet". |

### Effect today

Because no product has approved directions, **every routine is essentials
plus clearly optional additions**, and any matching treatment appears under
"Not included yet: its usage directions are still being reviewed." This is
deliberate: the specification forbids recommending a treatment without
approved directions. When a reviewer adds an entry to `APPROVED_DIRECTIONS`,
that treatment becomes eligible under all the exclusions above, with no code
change.

### Verification

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 21 warnings (the old engine's `any` removed) |
| Tests | **45 files, 443/443**. Routine suite rewritten: 26 tests over a 560-profile matrix, each run twice: with the real (empty) registry, and with **synthetic test-only** approved directions for every treatment, so the exclusions are proven where treatments would otherwise be eligible. |
| `npm run build:offline` | Pass |
| Mutation checks | Mapping unknown pregnancy to `no` fails 3 tests; letting irritated skin keep treatments fails 2; letting beginners have treatments fails 2 |

Tests cover: irritated (no treatment anywhere, consistent explanation, no
acid cleanser); very high reactivity (no treatment, no optional additions);
unknown pregnancy (distinct quiz values, unknown preserved including missing
answers, retinoid never eligible on yes or unknown, allowed only on explicit
no); under 18 (never a retinoid); beginner cap (≤3 per session across every
combination, essentials only, the audited simple-routine case ≤3 products);
optional categories never in the core routine; no exfoliant beside a
retinoid; directions gating; one-active limits; determinism; catalogue
validity; SPF last; no efficacy claims.

Browser (dev, no database):

| Scenario | Observed |
| --- | --- |
| Pigmentation, experienced, currently irritated, pregnancy "prefer not to say" | Morning: centella balm, ceramide cream, sunscreen. "Not included yet: Vitamin C Serum, left out while your skin is irritated." Explanation and warning both say no actives or exfoliation. Essentials ₹1,677. |
| Simple routine, no routine, dry, mild dark circles | Morning 3 steps, evening 2. Essentials: 3 products, ₹1,227 (audit: 9 products, ₹4,821). Toner and eye patches listed as optional, outside the total. |
| Retinal product page, How to Use | "Directions specific to this product are being reviewed…"; "twice daily" appears nowhere |

### Missing reviewed product information

Needed before any treatment can be recommended; none of it may be invented:

| Needed | For which products |
| --- | --- |
| Approved, product-specific directions (session, frequency, introduction, sign-off) | All 8 treatments: retinal ampoule, vitamin C serum, LHA, PHA, AHA/bifida pads, papaya enzyme powder, niacinamide drops, copper peptide |
| Clinician-reviewed rules for irritation, reactivity, pregnancy/nursing, under-18 and prescription use | The engine's exclusions are conservative engineering assumptions, documented here, pending review |
| Full INCI and active concentrations | All products; the treatment classification is from names and highlights only (#18) |
| Confirmation that the centella cleansing balm suits single-cleanse use | Used as the cleanser for irritated, very reactive and sensitive skin |
| Approved directions for essentials (cleansers, moisturisers, sunscreen quantity and reapplication) | Product pages currently say directions are under review |

### Limitations

- Routine prices still come from catalogue figures through the shared rule,
  not the live quote (audit #12): prompt 14.
- The dark-spot, consistency and sun-exposure answers still do not change the
  result (audit #14): prompts 7 and 14.
- Schedules are still per session, not per day (audit #21): prompt 15.
- Saving still stores client-sent answers and results (audit #15–#17):
  prompt 16. Old saved routines keep `pregnancy: 'no'` where the customer
  chose "prefer not to say"; they are display-only today and will be marked
  for recomputation in prompt 16.
- The retinal tagline's "zero irritation" claim remains (audit #09): prompt 4.

---

## Prompt 4 — Honest claims, offers and business content (7 October 2026)

### Offer audit against the order calculation

`createOrder` computes totals with `calculateTotals(lines, 0)`: no basket
promotion, credit, gift line or bundle price exists anywhere in the order
path, invoice or fulfilment. Only catalogue sale prices and owner price
overrides (both already shown per SKU since prompt 2) and the delivery rule
reach an order.

| Advertised | Where | Applied by checkout? | Action |
| --- | --- | --- | --- |
| Buy 2, Get 3rd Free | Announcement bar | No | Removed |
| Up to 33% off + freebies above ₹1,199 | Announcement bar | No | Removed |
| Free surprise gift above ₹1,199 | Announcement bar, bag progress bar | No | Removed; the bag bar now tracks free delivery |
| Bundle saving up to 15% / 15% off every bundle | Announcement bar, homepage panel | No | Removed |
| 5% cashback as Avyora Credit | Homepage hero and panel | No ledger | Removed |
| "The Avyora Circle" membership, earn and redeem credit | Homepage hero slide 2 | No | Slide removed |
| Complimentary delivery, always | Homepage panel | No: ₹79 below ₹1,199 | Replaced with the actual rule |
| Newsletter "early access" | Footer | Form had no handler | Removed |
| "Be the first to review" | Product pages | No submission flow | Now "No reviews yet." |
| "Taxes & shipping calculated at next step" | Bag | Prices already include GST | "Prices include GST. Delivery is shown at checkout" |
| Free delivery at ₹1,199 or more, ₹79 below | Banner, hero, panel, bag, shipping policy | Yes | Kept, all generated from `FREE_SHIPPING_THRESHOLD_PAISE` and `STANDARD_SHIPPING_PAISE` |

### Claims and business details

| Change | Detail |
| --- | --- |
| Product copy | 48 taglines and descriptions rewritten to describe format, texture and the ingredients already named. Removed: "zero irritation", "zero residue", "zero white cast", "without stinging or redness", "boost collagen", "anti-wrinkle", "repair tissue", "structural level", "block dark spot formation", "shrink pores", "instantly", "gold standard", "in 10 minutes", and similar. Names and stated percentages (10%, 70%, 77%, 95%) are kept as the owner's data, unverified. |
| Clinical and quality claims | "Clinical science", "Clinical formulations", "Clinical catalogue", "science-backed", "maximum efficacy", "small clinical batches for maximum active stability" and "formulated in-house" removed from the homepage, collections page, footer and site metadata. |
| "Best Seller" badges | Relabelled "Our pick": there are no sales figures behind them. The `?filter=bestsellers` URL is unchanged. |
| Dummy WhatsApp | `+91 99999 99999` removed from the footer and contact page. |
| Support email | Centralised as `SUPPORT_EMAIL` in `src/data/business-info.ts`; still unconfirmed (below). Footer, policies and both error pages use it. |
| Domain | `avyora.com` was hardcoded into `metadataBase`, Open Graph, product JSON-LD, the sitemap and robots, but no custom domain is verified. All now use `SITE_URL` (`NEXT_PUBLIC_SITE_URL`, defaulting to the deployed vercel.app origin). |
| Unconfirmed entity | "Avyora Labs" author/publisher and the `@avyora` Twitter handle removed from metadata. |
| Policies | Reply-time promise replaced with `[TO CONFIRM]`; "we email tracking details" (no such email exists) replaced with the tracking page. Fixed "emailingsupport@…" run-together text on the refund and shipping pages. |

### Publication checks

| Check | What it does |
| --- | --- |
| `src/lib/content-claims.ts` | Pure rules for placeholders, unsupported offers and absolute claims. Remove an offer rule when its feature ships. |
| CMS publish | `content.publish` refuses a draft containing any of them: "Not published: "…" (reason). Edit the draft and try again." |
| `src/lib/__tests__/content-claims.test.ts` (CI) | Scans all customer-facing source (comments stripped; admin, manager, API excluded) and the catalogue: no unsupported offer, no absolute claim, no dummy phone, no delivery figure hardcoded outside `lib/money.ts`; delivery copy matches `calculateTotals` at ₹1,198 and ₹1,199. |
| `npm run check:launch` | Lists every remaining blocker and exits 1 until there are none. Not in CI, because unfinished business content is expected during development. |

### Verification

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 21 warnings |
| Tests | **46 files, 469/469** (25 new content tests, 1 new CMS integration test) |
| `npm run build:offline` | Pass |
| Mutation check | Restoring "zero irritation" on the retinal and "Buy 2, Get 3rd Free" in the banner fails 2 tests |

Browser (dev, no database):

| Surface | Observed |
| --- | --- |
| Banner | "Free delivery on orders of ₹1,199 or more" / routine finder prompt |
| Homepage | Single hero, no cashback or membership; panel lists the essentials-first routine and the ₹79 / ₹1,199 rule; no "clinical", "bundle", "best seller" or newsletter anywhere on the page |
| Product page | Neutral retinal copy; "No reviews yet."; JSON-LD URL on the deployed origin |
| Bag | ₹399: "Add ₹800 for free delivery", 33%. ₹1,298: "Free delivery", 100% |
| Checkout | ₹399: delivery ₹79, total ₹478. ₹1,298: delivery free, total ₹1,298 |
| Shipping policy | "Delivery is ₹79 on orders below ₹1,199, and free at or above ₹1,199." |
| Contact, privacy, refund, terms | No WhatsApp or dummy number; placeholders visible and counted by the launch check |

### Remaining business-content dependencies

`npm run check:launch` currently reports 9 items:

| Needed from the owner | Where |
| --- | --- |
| Registered entity name, registered address, GSTIN | Contact, privacy, terms |
| Grievance officer name, email and address | Contact, privacy |
| Support reply time | Contact |
| Confirmation that `support@avyora.com` exists and is monitored (no custom domain or verified email domain exists yet) | Footer, all policies |
| WhatsApp number, if one will be offered | Footer, contact |
| Social profile URLs | Footer (icons hidden until set) |
| Policy "last updated" dates after review | All four policies |
| Return window, damaged-item report window, refund time, change-of-mind return cost | Refund policy |
| Despatch time, delivery time, lost-parcel window | Shipping policy |
| Data retention period for order records | Privacy |
| Courts with jurisdiction | Terms |
| Approved directions for 8 treatments | See prompt 3 |

Also needs the owner or a reviewer, but not machine-checkable:

- Substantiation for any claim to be reinstated, including concentrations in
  product names (10%, 70%, 77%, 95%), "low-pH / pH 5.5", and sunscreen
  protection (no SPF or PA rating is recorded anywhere).
- Which products are genuinely featured ("Our pick").
- Legal review of the draft policy wording itself.
- Real product photography and logo (audit #22, later prompts).

### Limitations

- CMS product copy and journal articles already published in the production
  database were not scanned (no database was used). The publish gate applies
  from the next publish; re-publishing existing entries runs them through it.
- The phrase rules catch known wording, not every misleading sentence; they
  sit beneath human review, not instead of it.
- Every page declares the homepage as its canonical URL (`alternates.canonical:
  '/'` in the root layout). Out of scope here; flagged as a separate task.

---

## Prompt 5 — Normalised catalogue and SKU identities (7 October 2026)

### What changed

| Area | Change |
| --- | --- |
| Identity rule (`src/modules/catalog/catalog-records.ts`, new) | Every product keeps its id; every size gets a stable variant id `productId-size` (lowercase, whitespace removed, e.g. `retinol-90ml`, `bifida-exfoliating-pads-60pads`), so "30ml", "30 ml" and "30 ML" cannot become two SKUs. `legacyStockKey` (`productId::size`, the existing `skuKey`) is the explicit compatibility map. `catalogProblems` rejects duplicate ids, slugs, variant ids and legacy keys, missing sizes, non-positive prices and sale prices above list. |
| Migration `drizzle/0014_catalog_variants.sql` (additive) | New `catalog_products` (PK id, UNIQUE slug, index category + published) and `catalog_variants` (PK id, FK product ON DELETE RESTRICT, UNIQUE legacy key, UNIQUE product + size, CHECK legacy key = `product_id::size_label`, CHECK volume > 0). Nullable `variant_id` with FK (RESTRICT) and index added to `inventory`, `product_pricing` (both UNIQUE: one stock row and one price row per SKU), `cart_items`, `order_items` and `restock_requests`. |
| Seed | 27 products and 30 variants from the catalogue file: id, slug, name, category, size label, and volume only when the label states ml. Nothing else is seeded: copy stays in the CMS, list prices in the catalogue file with owner overrides in `product_pricing`, and no formulation, INCI or directions data (prompt 6). Grams, pads, patches and masks have no volume. Generated, not hand-typed, by `scripts/catalog-seed-sql.ts`; inserts are `ON CONFLICT DO NOTHING`. |
| Backfill | Existing rows in the five tables get `variant_id` by matching `product_id::size` to the legacy key. Unmatched rows stay null and are reported, never guessed. |
| Compatible write path | Trigger `resolve_catalog_variant` fills `variant_id` from `(product_id, size)` on every insert and update, so all existing writers (stock seeding, admin pricing, cart mirror, restock, reservations) record the SKU unchanged. It refuses a `variant_id` that contradicts the pair or names an unknown SKU, and re-resolves when a row's size changes. |
| Consumers moved | `getVariant` / `getVariantById` in `lib/catalogue.ts` (in-memory index from the same records). Cart validation (`isKnownSku`) resolves through it; checkout writes `variantId` on each new order line next to the frozen name, size and prices. Reads still key on `(product_id, size)`: the compatible read path until `variant_id` becomes NOT NULL. |
| Historical orders | Product name, size, unit price, quantity, line total and pricing snapshot untouched; `variant_id` is an additional reference only. |
| Integrity check | `src/modules/catalog/catalog-integrity.ts` + `npm run db:check-catalog` (read-only): catalogue-file problems, products/variants missing or differing between file and database, rows with no SKU per table, impossible price overrides, negative stock without backorder. Exits 1 if anything is found. |
| Tests | Three older tests (`inventory.integration`, `stock-restoration.integration`, `sql-injection`) created `inventory` with hand-written DDL and broke on the new column; they now run the real migrations. |

### Migration results

| Where | Result |
| --- | --- |
| PGlite, legacy fixtures (test) | Migrations 0000–0013 applied, legacy-shaped rows written (stock, override, cart, two order lines, restock request), then 0014 applied. All catalogue SKUs mapped; one stock row and one order line for a product not in the catalogue (`retired-serum / 15ml`) stayed null and were reported; historical order name, size and prices identical. |
| Neon rehearsal branch `catalog-0014-rehearsal` (copy of production at 7 Oct, production untouched) | 0014 applied cleanly. 27 products, 30 variants. **30/30 inventory rows and 1/1 order line mapped; 0 unresolved**; no pricing, cart or restock rows exist yet. Integrity check: nothing found. Order line `ha-toner / 200ml` kept its ₹399 charge. |
| Rollback rehearsal (same branch) | `docs/runbooks/0014_catalog_variants.rollback.sql` removed triggers, columns and tables; row counts and prices unchanged. `db:migrate` then re-applied 0014 and the integrity check was clean again. |

**Unresolved mappings: none in production data.** The only unmapped rows anywhere are the deliberate test fixtures.

### Deployment order

1. Branch production in Neon (rollback point).
2. `npm run db:check-catalog` is unavailable until the tables exist, so run `npm run db:migrate` against the branch first and check it there.
3. Deploy order is flexible: 0014 is additive and the trigger fills `variant_id` for code that does not know about it, so either the schema or the application may go first. Recommended: apply 0014 to production (`npm run db:migrate`), run `npm run db:check-catalog`, then deploy the application.
4. When a product or size is added to the catalogue file, add its rows in a new migration: `npx tsx scripts/catalog-seed-sql.ts --rows` prints them; `npx drizzle-kit generate --custom --name catalog_<what>` creates the file. The migration test fails until the database matches the file.

### Rollback behaviour

- **Application only** (most likely): roll back the deployment. Older code ignores the new tables and columns; its inserts still get `variant_id` from the trigger. No schema change needed.
- **Schema**: run the rollback SQL in one transaction. It drops only what 0014 added; all pre-0014 data is unchanged. Order lines lose only the `variant_id` reference, never their recorded name, size or price.
- Variants are never deleted (FKs are RESTRICT); retire one by setting `active = false`.

### Verification

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 21 warnings |
| Tests | **47 files, 481/481** (12 new catalogue tests, checkout now asserts `variantId: 'retinol-90ml'` on the 90ml × 3 order) |
| `npm run build:offline` | Pass |
| Cart fixes from prompt 2 | Cart, checkout-quote and availability suites unchanged and passing |

One full run had 2 intermittent failures in `otp.integration.test.ts` (both tests hash several codes with the password KDF); four further full runs and isolated runs passed. Unrelated to this change; recorded rather than masked with a longer timeout.

### Not done, by design

- No production migration: per the prompts, production changes wait for your approval.
- `variant_id` stays nullable and reads still use `(product_id, size)`; making it NOT NULL and switching reads is a later step once production has run on 0014.
- `active` is stored but nothing reads it yet; there is no retirement flow.
- The spec's `copy` and `formulation_version` columns are omitted: copy is owned by the CMS and formulations arrive with prompt 6, so adding them now would create a second source.
- Drizzle's schema does not model the two CHECK constraints or the trigger (it cannot); they live in the migration and are covered by the migration test.

---

## Prompt 6 — Canonical ingredients, formulations and directions (8 October 2026)

### Records implemented

| Record | Where | Notes |
| --- | --- | --- |
| Canonical ingredient dictionary | `src/modules/ingredients/dictionary.ts` (single source; was inside `scripts/seed-ingredients.mjs`) | 17 ingredients with INCI, common name, aliases, class and the existing prescription / pregnancy / photosensitising flags. **Retinaldehyde added as `retinal`, separate from `retinol`**; its flags mirror retinol's pending review. |
| Ambiguous aliases | same file | `vitamin a`, `vitamin c`, `aha`, `bha`, `pha`, `retinoid`, `uv filters`, `peptides` never resolve. Four of these previously resolved silently: `vitamin a` → retinol, `vitamin c` → ascorbic acid, `aha` → glycolic acid, `bha` → salicylic acid (also the preservative butylated hydroxyanisole). |
| Alias map and resolver | `src/modules/ingredients/resolve.ts` | Normalises a label (case, parenthetical asides, printed percentages, punctuation) and returns `resolved`, `ambiguous` or `unresolved`. A printed percentage is kept as an unverified `labelClaim`, never as a concentration. Two dictionary entries claiming one alias become an ambiguity and an import error, not a guess. |
| Formulations | `src/modules/ingredients/formulations.ts` (types, checks); `src/data/formulations.ts` (records) | Versioned per product; full INCI verbatim; every position in order with optional canonical id; concentration `{known: true, value, unit}` with unit `percent_w_w`, `percent_w_v`, `mg_per_g` or `mg_per_ml`, or `{known: false}`; coverage `complete`, `partial` or `unknown`. |
| Usage profiles (approved directions) | `ProductDirections` in `src/data/product-directions.ts` | Now bound to a formulation version, with `maxWeeklyUses` (1–14 or null) and evidence references. A new formulation version needs its own approval. |
| Evidence sources | `src/data/formulations.ts` | Type, title, https URL or none, retrieval date, limitations. |
| Interaction rules | `src/modules/ingredients/interaction-rules.ts` | The 5 existing rules, moved unchanged with their citations. |
| Database (migration `0015_knowledge_records`, additive) | `ingredient_aliases`, `evidence_sources`, `formulations`, `formulation_ingredients`, `usage_profiles`; `ingredients.class` | Constraints: one meaning per alias; known concentration ⇒ positive value, allowed unit, ≤ 100 for percentages; unknown ⇒ no value or unit; complete coverage ⇒ INCI list; unique product + version; https-only evidence URLs; session and weekly-use bounds; FKs to catalogue products, ingredients and evidence (RESTRICT). |
| Importer | `npm run db:import-knowledge` (`db:seed-ingredients` now runs the same) | Validates everything, then writes in one transaction; refuses and writes nothing on any problem. `scripts/seed-ingredients.mjs` removed. |

**Verified information migrated: the dictionary identities and the five existing interaction rules only.** No formulation, INCI list, concentration, direction or evidence source exists in the repository, so `FORMULATIONS`, `EVIDENCE_SOURCES` and `APPROVED_DIRECTIONS` are empty and every product's coverage is `unknown`. The catalogue's highlight strings were not converted into formulation data, and their printed percentages were not stored.

### Where unresolved ingredients used to imply compatibility

| Path | Before | Now |
| --- | --- | --- |
| Product-page recommendations (`conflictingProducts`) | Highlights that matched nothing made a product look ingredient-free, so it passed the conflict filter as "no conflict" | Each product resolved through the alias map. An ambiguous label counts as each of its dictionary candidates (pessimistic): "vitamin c" can conflict as ascorbic acid. Products not fully resolved are returned as `unchecked` and are never scored as a routine fit. Cache key moved to `conflicts:v2:` so old cached values are not misread. |
| Routine checker (`evaluateRoutine`) | Unidentified ingredients silently ignored | Optional `unresolvedLabels` produce a finding: "Some ingredients could not be checked". |
| Routine finder | Approved directions alone made a treatment eligible | Also requires `treatmentReadiness`: directions for a specific formulation version that is `complete`, passes every check, has its active identified (by class) with a known concentration, and has its evidence. Otherwise "Not included yet: its full formulation has not been verified" (`formulation_incomplete`). |
| Launch check | Listed treatments without directions | Lists knowledge problems and each treatment's readiness. |

### Import and publication checks

Refused by the importer and tested: alias collisions; interaction rules naming unknown ingredients or tier 2 without a citation; unknown ingredient ids; ambiguous INCI labels; a label resolving to a different id than recorded; invalid units; zero, negative or above-100% concentrations; known percentages adding up to more than 100%; position gaps or repeats; complete coverage without the INCI list, or an INCI list whose count disagrees with the positions; unknown coverage that lists ingredients; missing evidence sources; non-https evidence URLs; duplicate formulations or evidence; directions naming a formulation version that does not exist, or missing evidence; weekly uses outside 1–14. The database constraints repeat the ones that can be expressed in SQL.

### Verification

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 21 warnings |
| Tests | **49 files, 548/548** |
| `npm run build:offline` | Pass |
| Mutation checks | Exact-string matching restored: 6 failures. Directions alone unlocking a treatment: 13 failures. "vitamin c" no longer ambiguous: 6 failures. All pass when restored. |
| Neon rehearsal branch (copy of production, production untouched) | 0015 applied; import: 17 ingredients (16 before; `retinal` new), 37 aliases of which 8 ambiguous, 5 rules (updated in place), 0 formulations; re-run identical; catalogue integrity check still clean. The old `vitamin a` synonym on retinol was replaced by the alias table. |

New tests: label matching for the audited strings ("Niacinamide 10%", "Hyaluronic Acid (5 Weights)"), parenthetical labels ("Gluconolactone (PHA)", "PDRN (Salmon DNA)"), percentages kept as label claims, retinol vs retinaldehyde, every ambiguous alias, alias collisions, every publication check, readiness in six failure modes, importer success, idempotency and refusal, database constraints, ambiguous labels as possible conflicts, unchecked products never a routine fit, and the routine finder keeping a treatment out with no, partial, unknown, unidentified-active, unknown-concentration, ambiguous-label or wrong-version formulations.

Two older tests (`interactions.integration`, and the 0014 migration test's pre-migration folder) were fixed to build from the real migrations in order.

### Still requiring qualified review

| Item | Why |
| --- | --- |
| Full INCI, in order, for all 27 products | Needed for any coverage above `unknown` |
| Active concentrations with units, from the formulation dossier | Required for a treatment to become ready; label claims (10%, 70%, 77%, 95%, 96%) are not evidence |
| Approved directions per formulation version (session, frequency, weekly maximum, introduction) | No treatment can be recommended without them |
| Evidence source for each record (dossier or label) | Every record must cite one |
| Retinaldehyde flags (pregnancy caution, photosensitising) | Set to match retinol conservatively; confirm |
| Dictionary entries for the remaining actives: gluconolactone, capryloyl salicylic acid (LHA), papain, copper tripeptide-1, zinc PCA, and others in the highlights | Until added, those products' actives cannot be identified, so they can never be ready |
| Interaction rules for retinaldehyde | The existing vitamin C sequencing advice names retinol and tretinoin only; nothing was extended to retinal without review |
| Whether the dictionary's grouped entries (hyaluronic acid as sodium hyaluronate; ceramides as one entry) are acceptable for interaction checking | Grouping hides salt and ceramide-type differences |

### Not done, by design

- Not applied to production (requires your approval); rehearsed on the Neon branch.
- The knowledge release pipeline (compiled JSON, release hash, revocation) is later work; until then the code modules are the release and the database is a validated copy.
- No admin editor for formulations; records are added in code and imported.

---

## Prompt 8 — Personal records: ownership and consent (8 October 2026)

Prompt 7 (shared typed recommendation contracts) was not run: prompt 8 was the next one given. It remains open in the sequence.

### Migration `0016_personal_records` (additive)

| Table | Purpose | Enforced in the database |
| --- | --- | --- |
| `consent_records` | One grant of one purpose under a policy version; withdrawal sets `withdrawn_at` | Exactly one owner; owner hash must be 64 hex characters; purpose is one of `photo_processing`, `routine_saving`, `progress_photo_storage`, `model_research`; at most one active grant per owner and purpose; append-only (may be withdrawn once, never edited, reassigned or restored; a new grant is a new row); withdrawal not before grant |
| `skin_profiles` | Quiz answers saved on purpose | Exactly one owner; requires a `routine_saving` consent via composite FK (consent id + purpose); active consent of the same owner at insert; expiry required; guest expiry within 30 days |
| `routine_results` (extended) | Saved routines | Existing ids kept. New columns: owner hash, profile, consent, `schema_version`, `input_hash`, `kb_release`, `engine_version`, `model_version`, `expires_at`. Any row with `schema_version >= 1` needs exactly one owner, no cart id, a routine-saving consent, input hash, engine version and expiry (guest within 30 days). Legacy rows (`0`) cannot be given a guest owner or consent afterwards |
| `scan_sessions` | Local or hosted scan, for later prompts | Exactly one owner; requires `photo_processing` consent; spec statuses and modes only; observations expire within 7 days; a photo object only for hosted scans, only under `private/scans/` (no URLs, no `..`), with an object expiry within 24 hours |
| `routine_feedback` | Weekly report on a saved routine | Account-only; FK to routine and user; one per routine, user and week; week 1–52; bounded answers (adherence, tolerability, reported change) |

Triggers: records needing consent are refused unless the consent is active and has the same owner; a scan cannot advance to uploaded, queued, processing or completed after withdrawal; withdrawing photo processing marks that consent's scans `revoked` and clears their results and quality at once (the object key stays so the deletion worker can remove the photo). Indexes: owner + time on every table, expiry indexes, scan status + time, routine dedupe (input hash + release), consent owner + purpose. Deleting an account cascades its consents, profiles, routines, scans and feedback; orders are untouched.

### Guest ownership

`src/lib/guest-owner.ts`: 32 random bytes generated on the server, sent only as the `avyora_owner` cookie (HttpOnly, SameSite=Lax, Secure in production, 30 days). Only its SHA-256 is stored. A value that is not a secret this server issued (a cart UUID, a client-supplied hash, an empty value) is rejected. The cart cookie (`avyora_cart_id`) is never accepted as proof of ownership. A secret is only issued when a guest is about to own something (`ensureGuestOwnerHash`), never just for finishing the quiz.

### Behaviour change

| Before | Now |
| --- | --- |
| Every completed quiz saved its full answers (including pregnancy) and result to `routine_results`, keyed by the cart cookie in plaintext, without consent or expiry | Saved only if the owner has an active `routine_saving` consent; then written as a skin profile plus a versioned routine with a 30-day (guest) or 180-day (account) expiry. No consent flow exists in the interface yet, so **nothing is saved today**. The aggregate `routine_completed` event (skin type and concern only) is unchanged. |
| `saveRoutineResult` in `lib/activity.ts` | Removed; replaced by `saveRoutine` in `src/modules/personal/personal-records.ts`, with `grantConsent`, `withdrawConsent`, `activeConsent` and owner-scoped `savedRoutines` |

### How existing records migrate

- Every existing `routine_results` row is backfilled as `schema_version = 0` (legacy), keeping its id, answers, result, `user_id` and `anonymous_id` exactly. Nothing is reinterpreted: no consent or owner hash is invented for it.
- An account's legacy rows remain that account's. A legacy guest row has no provable owner (only a cart id), so it is retrievable by no one. Nothing ever read these rows back, so no customer loses access to anything they could reach before.
- Legacy rows never appear in `savedRoutines` and cannot later be given a guest owner or consent.
- Code from before this change cannot write a new legacy row: `schema_version` has no default, so its insert fails, and `persistRoutine` already swallowed save failures. Deploying the schema before the application is therefore safe and stops automatic saving immediately.
- Orders, users, carts and every other commerce record are untouched.

### Results

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 21 warnings |
| Tests | **50 files, 580/580** (32 new database tests) |
| `npm run build:offline` | Pass |
| Mutation checks | Withdrawal not revoking scans: 1 failure. Consent trigger ignoring withdrawal: 2 failures. Both pass when restored. |
| Neon rehearsal branch (copy of production) | 0016 applied cleanly. Production's **one** saved routine (a guest row with full answers including pregnancy, saved before consent existed) is now `schema_version 0`, content and id unchanged, no owner hash or consent. No consent, profile, scan or feedback rows exist. An old-style automatic save was refused. Catalogue integrity check still clean. |

The tests cover: one-owner and hash-shape constraints on every table, borrowing another owner's consent, owners seeing only their own routines, no saving without consent, purpose separation (a photo consent cannot authorise saving and vice versa), one active grant per purpose, withdrawal stopping saves and hiding saved routines, scan revocation and the ban on advancing a revoked scan, append-only consents, guest 30-day and account 180-day expiry, expired routines no longer returned, every scan photo-storage rule, duplicate weekly feedback, feedback bounds, foreign keys, account deletion cascades, the legacy row's preservation and isolation, and that cart ids or supplied hashes are not accepted as guest secrets.

### Remaining dependencies

| Needed | Who / when |
| --- | --- |
| Decide what to do with the one legacy saved routine (guest, with pregnancy answer, saved without consent, unreachable by anyone) | You. Recommended: delete it. Not deleted here because deleting records needs your approval. |
| Consent wording and policy versions (the `policy_version` strings) | Policy text with counsel; the privacy policy still has placeholders (prompt 4) |
| Interface to grant and withdraw consent, and to save a routine | Later routine-finder and account prompts |
| Expiry sweeper (delete expired profiles, routines, scans and photo objects in small batches; alert on photo backlog) | Later prompt; the expiry columns and indexes are ready |
| Private photo storage adapter and deletion worker | Scan prompts; the schema already confines keys to `private/scans/` and 24 hours |
| Linking a guest's records to an account on sign-in (migrate or delete, per spec) | Later; ownership changes are not implemented |
| Applying 0016 to production | Your approval |

---

## Prompt 9 — Versioned knowledge releases (8 October 2026)

### Records (`src/modules/knowledge/records.ts`)

Every record with clinical, safety or customer-facing meaning carries a `review`: either `draft`, or `approved` with reviewer id, ISO review date and evidence source ids. Identity data (catalogue products and variants, ingredient INCI names, classes and aliases) needs no clinical review; ingredient **caution flags** do.

| Record | Notes |
| --- | --- |
| Ingredient | Canonical identity (prompt 6) + `cautionsReview`. Unreviewed cautions are published as `{status: 'unreviewed'}`, never as "no caution". |
| Formulation, usage profile (directions), evidence source | From prompt 6, validated by the same checks |
| Decision rule | `id`, `version`, `severity` (`safety` or `advisory`), condition `when`, `effects` (`mode`, `excludeClass`, `maxTreatments`, `askClarification`), `reasonTemplateId`, review |
| Interaction | The prompt 6 rules plus a review |
| Bayesian parameter | Concern, prior, per-evidence-group likelihoods, `validationStatus` (`validated`, `provisional`, `synthetic_fixture`) and provenance (training and calibration versions, counts, note) |
| Explanation template | Text with `{placeholders}`; only declared variables from a permitted list (`productName`, `concern`, `frequency`, `session`, `skinType`) |
| Education answer | Question aliases, approved answer, scope |

### Conditions as a predicate tree (`predicate.ts`)

Five operations (`eq`, `in`, `all`, `any`, `not`) over eight normalised profile fields, each with a finite value domain. A strict Zod schema rejects unknown operations, unknown fields, extra keys and strings; values outside a field's domain and nesting deeper than 6 are rejected. `evaluate` is a plain interpreter: **no rule is ever executed as code**. Because domains are finite, satisfiability is exact (exhaustive over the fields a condition mentions), which is what detects unreachable and overlapping rules.

### Compiler (`compile.ts`)

Produces six artifacts (`catalogue`, `ingredients`, `rules`, `parameters`, `explanations`, `evidence`) as canonical JSON (keys sorted at every level, records sorted by id) and a manifest with schema version, record count and SHA-256 per artifact. The release id is `kb_` + the first 32 hex characters of the SHA-256 of the canonical manifest: identical input gives an identical release byte for byte, regardless of input order, and any change gives a new id. No clock or randomness is involved. `verifyRelease` recomputes every checksum and the id.

It refuses to compile when there is:
- any draft record ("Draft safety rule" for safety rules and interactions);
- an approval without a reviewer, date or existing source;
- a malformed condition, or one that can never be true;
- two rules that can apply to the same profile but demand different modes;
- contradictory effects within a rule, or a `maxTreatments` value outside 0–3;
- a missing reason template, or a template that uses an undeclared or forbidden variable;
- a duplicate rule id;
- invalid Bayesian parameters (probabilities not strictly between 0 and 1, a duplicate concern or observation);
- **synthetic parameters in a production build**, or `validated` parameters without training and calibration versions and counts;
- any formulation, evidence or directions problem from prompt 6, or a formulation for an unknown product;
- an alias collision, or an interaction naming an unknown ingredient (or tier 2 without a citation);
- **an incomplete restricted formulation**: a treatment with directions whose formulation is not ready.

### Storage, activation, rollback, revocation (migration `0017_knowledge_releases`, `releases.ts`)

| Element | Behaviour |
| --- | --- |
| `kb_releases` | Manifest, artifacts (inline JSON text, exactly as hashed), checksum, fixture flag, status `stored` → `published` → `revoked` (or `stored` → `revoked`). A trigger makes the content immutable, allows only those status moves and forbids deletion. |
| `kb_active_release` | Single row (primary key can only be `true`): active release and the previous one. A trigger refuses fixture releases and anything not `published`. |
| `activateRelease` | One transaction: locks the pointer, re-verifies the stored artifacts against their checksums, publishes the release, moves the pointer, records the previous one, writes an audit entry. |
| `rollbackRelease` | Re-activates the previous release, same path, with a reason. |
| `revokeRelease` | Requires a reason. Refused for the active release (also enforced by trigger): activate or roll back first. A revoked release can never be activated again; `releaseUsable` lets saves reject it. |
| `loadActiveRelease` | Returns parsed artifacts, verifying checksums on every load; throws if the stored bytes no longer match. |
| `npm run kb -- build \| status \| publish --confirm \| rollback --reason … \| revoke <id> --reason …` | `build` touches no database and prints what awaits review |

Reuse of the existing CMS: the release commands reuse the audit log and its conventions. CMS documents were not used for these records, because CMS publish means "an editor published this text", not "a qualified reviewer approved this safety rule". Education answers are the natural candidate for a CMS content type once an approval step exists.

### Inference without an LLM (`inference.ts`)

`applyRules` interprets the rules for a profile: mode, excluded classes, the strictest treatment limit and the reasons that applied. `posterior` multiplies prior odds by one likelihood ratio per evidence group; a missing observation is neutral, and repeated observations in one group count once. Tested against the specification's worked example (0.20 → 0.429 → 0.60).

### Development fixture

`src/modules/knowledge/__fixtures__/development-fixture.ts` is labelled **DEVELOPMENT FIXTURE: NOT CLINICAL KNOWLEDGE** and signed by "DEVELOPMENT FIXTURE (not a reviewer)". It covers the draft rules as fixture-approved, a synthetic complete formulation with directions, and synthetic Bayesian parameters. It compiles only with `fixture: true`, the manifest records that, and the database refuses to activate it.

### Results

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 21 warnings |
| Tests | **52 files, 618/618** (29 compiler and inference tests, 9 database tests) |
| `npm run build:offline` | Pass |
| Determinism | Same release id from two separate `kb build` runs; tests confirm byte-identical output and order independence |
| Integrity | Tampered artifact, relabelled manifest, and stored bytes altered behind the trigger are all detected |
| Mutation checks | Contradiction detection disabled: 1 failure. Record sorting removed: 1 failure. Both pass when restored. |
| Neon rehearsal branch (copy of production; production untouched) | 0017 applied. `kb publish` stored and activated `kb_d7785df246963af6d01463055409ba4b` (3.2 KB); `status` verified it; rollback correctly refused (no previous release); publishing again was a no-op with no duplicate audit entry. |

### The production release today

`kb_d7785df246963af6d01463055409ba4b` contains the 27 products and 30 variants, and the 17 ingredient identities with aliases, cautions marked unreviewed. It has **0** rules, interactions, parameters, templates, education answers, formulations and evidence sources, because none is approved. It is not active anywhere but the rehearsal branch. Nothing reads releases yet; the routine engine still applies its prompt 3 logic. Switching inference to the active release belongs to the recommendation prompts.

### Awaiting qualified review (42 items, listed by `npm run kb -- build`)

| Item | Count |
| --- | --- |
| Decision rules restating the engine's current safety policies (irritated recovery, very reactive gentle, beginner no treatments, retinoid pregnancy/unknown, retinoid under 18, one active at a time) | 6, all `draft` in `src/data/knowledge.ts` |
| Explanation templates (the routine finder's current "Not included yet" wording) | 6 drafts |
| Interaction rules (1 tier 2 with citation, 2 tier 3, 2 tier 4) | 5 |
| Ingredient caution flags (prescription, pregnancy, photosensitivity) | 17 |
| Directions and complete formulations for treatments | 8 |
| Bayesian parameters | none exist; must come from consented, labelled data with calibration, or be stated as provisional assumptions |
| Education answers | none exist |
| Evidence sources | none recorded |

### Not done, by design

- Migration 0017 and a first release not applied to production (your approval).
- No staff interface for releases yet; the CLI and commands are the interface.
- Release artifacts are stored inline in Postgres; object storage (`artifact_key`) is unnecessary at 3 KB.
- Cache invalidation on activation is not wired because nothing caches releases yet.

---

## Prompt 10 — Durable rate limits and API safeguards (8 October 2026)

### Limiter (`src/lib/rate-limit.ts`, rewritten)

- **Durable and shared**: counters in Postgres (`rate_limits`), one atomic multi-row upsert per check covering every key (owner, identifier, IP), keys sorted so concurrent requests cannot deadlock. No process-memory fallback for any quota.
- **Failure modes per policy**: `closed` refuses with 503 `limiter_unavailable` when the database is unreachable, errors, or exceeds the 2.5 s budget; `open` allows. Previously every bucket failed open on errors and credential buckets fell back to one instance's memory on timeout.
- **Keys**: user id, guest owner hash, normalised identifier (trimmed, lowercased, inner spaces removed), and IP, each stored as a keyed HMAC (`RATE_LIMIT_KEY_SECRET`, falling back to `AUTH_SECRET`); no raw address or email is stored. Rotating the secret restarts all windows.
- **IP is secondary**: each policy has a separate, higher `ipLimit` where people share addresses, so one mobile carrier or office network does not lock out its users; identity limits are primary.
- **Responses**: 429 `rate_limited` or 503 `limiter_unavailable`, both JSON with `Retry-After` and `Cache-Control: no-store`; server actions show the matching message.
- **Configurable**: `RATE_LIMIT_OVERRIDES` (JSON, validated; invalid values ignored and reported) changes any limit, IP limit, window or failure mode per deployment.
- **Cleanup**: the daily sweep (`/api/cron/sweep`) prunes counters whose window ended over a day ago (`rate_limits.window_seconds`, migration 0018).

### Trusted client address (`src/lib/client-ip.ts`)

Vercel overwrites `x-forwarded-for` and does not forward client-supplied values (vercel.com/docs/headers/request-headers), so the first address in it is trusted **only** on Vercel (`VERCEL=1`) or when `TRUSTED_PROXY=x-forwarded-for` declares another overwriting proxy. Otherwise (local development, unknown hosts) there is no IP: identity limits still apply, and the in-memory browse limit in middleware is skipped rather than keyed on a spoofable header. `x-real-ip` is never trusted on its own; values that are not valid IPv4/IPv6 are rejected. Middleware, sign-in, checkout, payment, tracking and availability all use it; the four ad-hoc header readers are gone.

### Policies (starting settings, spec section 21)

| Policy | Per identity | Per IP | Window | On limiter failure | Applied to |
| --- | --- | --- | --- | --- | --- |
| `login` | 10 | 30 | 10 min | closed | Password sign-in, sign-up, code check, password reset |
| `otpSend` | 3 | 5 | 15 min | closed | Sign-in codes, reset codes |
| `otpResend` | 1 | — | 60 s | closed | Same (cooldown) |
| `adminLogin` | 5 (operator name) | 5 | 15 min | closed | Staff sign-in |
| `accountLookup` | 20 | 20 | 1 min | closed | "Does this account exist?", order tracking |
| `checkout` | 10 (account or email) | 10 | 10 min | closed | Cash-on-delivery orders |
| `payment` | 15 (account or email) | 15 | 10 min | closed | Razorpay order creation |
| `catalogBatch` | 60 (cart session) | 60 | 1 min | open | `/api/catalog/availability` (on CDN miss only) |
| `routineSaveMinute` / `routineSaveDay` | 5 / 20 (owner) | 30 / 200 | 1 min / 1 day | closed (save skipped) | Routine saves |
| `feedback` | 5 (owner) | 30 | 1 hour | closed | Ready; no endpoint yet |
| `scanStatus` | 20 (owner) | 60 | 1 min | closed | Ready; no endpoint yet |
| `newsletter` | 3 (email) | 10 | 1 hour | closed | Ready; no endpoint (prompt 4 removed the dead form) |
| `staffPublish` | 5 (staff user) | 30 | 1 min | closed | CMS publish and unpublish |
| Browse (middleware) | — | 120 | 1 min | in-memory, best effort | Page views, trusted IP only; static assets excluded by the matcher, so no database query per asset |

Deviation from the spec, recorded as a starting setting: the spec lists sign-in as 10 per identity **and** per IP; the IP allowance here is 30 so a shared network can sign in its users, while one identity is still held to 10 from any number of addresses.

Checkout and payment creation **replay** a retried order with a valid idempotency key even when the quota is spent: a customer whose order went through is never refused its confirmation.

### Scan admission and billable attempts (`src/modules/scans/admission.ts`, migration 0018)

- `admitHostedScan`: per owner 3 per UTC day and 10 per rolling 30 days; soft per-IP ceiling 20 per UTC day (keyed hash); 100 per UTC day globally. One transaction under an advisory lock; creates the scan session (subject to the consent trigger from 0016) and its admission row together. Fails closed.
- `scan_admissions` rows **outlive their scans** (`scan_session_id` set null on delete), so the 7-day scan expiry cannot shrink the 30-day count or reset the spend cap.
- `recordBillableAttempt`: at most 2 attempts per scan, enforced by a primary key and a CHECK, so a third or duplicate attempt cannot be recorded, even concurrently.

### Bounded inputs (`src/lib/request-body.ts`)

Bodies are read with a hard byte limit: `Content-Length` checked first, then the stream counted and abandoned once over the limit (never buffered in full), returning 413 `payload_too_large`. Limits: payment webhook 64 KB, payment creation 32 KB, verify 4 KB, staff login 4 KB, cart 16 KB (and at most 50 lines), wishlist 4 KB (at most 100 ids), activity 8 KB. Checkout orders are capped at 50 lines with bounded product-id and size strings; availability keeps its 50-SKU cap; server actions keep Next.js's 1 MB default.

### Payment webhook

Unchanged protections: signature verification on the raw body, replay deduplication by event id, reconciliation. Added: the 64 KB body bound. **No customer quota** is applied, so a genuine paid confirmation cannot be discarded; a test asserts the route never imports the limiter.

### Verification

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 20 warnings |
| Tests | **55 files, 650 passed, 3 opt-in skipped** (18 limiter, 7 IP/body, 7 admission and billing, 3 real-Postgres) |
| `npm run build:offline` | Pass |
| Real Postgres, 4 independent connection pools (Neon rehearsal branch, production untouched; 0018 applied there) | 60 racing sign-in checks admitted exactly 10; opposite key orders did not deadlock; 12 racing scan admissions admitted exactly 3. Three consecutive passes. |
| Mutation checks | Limiter failing open: 3 failures. Admission lock removed: **not** caught by PGlite (single connection), caught by the real-Postgres test (12 admitted instead of 3). Both restored. |
| Dev server | Staff login without a database: 503 `limiter_unavailable` with `Retry-After: 30` (fail-closed). Availability: 200 (fail-open policy). A spoofed `X-Forwarded-For` on a non-Vercel host is ignored. |

Tests cover quota and Retry-After, window reset, concurrent atomicity, multi-policy checks, shared networks (12 people on one address all allowed; one identity across 12 addresses stopped at 10; one address guessing many identities stopped at 30), identifier normalisation, no raw keys stored, fail-closed on error and on hang, fail-open for cheap reads, override validation, pruning, response shape, trusted-IP rules, body limits including chunked streams, scan admission budgets (daily, rolling 30 days surviving scan deletion, per IP, global, racing, withdrawn consent, database down) and the billable-attempt cap.

### Remaining gaps

| Gap | Note |
| --- | --- |
| Limiter latency under load | On the Neon branch, heavy concurrent bursts pushed counter queries past the 2.5 s budget, and closed policies then answer 503. Intended (no unprotected credential work), but tune `LIMITER_TIMEOUT_MS` and pool size from production latency, or move hot policies to Redis if contention is measured. |
| Staff login on a deployment without a database | Now refused (fail-closed); previously worked because staff credentials are environment variables. Production always has a database. |
| Endpoints that do not exist yet | Feedback, scan status, scan start and newsletter policies are defined and tested; wire them when those endpoints are built. |
| Daily notification spend cap | Spec asks for one on OTP sending; per-identifier and per-IP limits exist, a global daily cap does not. |
| Increasing backoff on repeated sign-in failures, and alerts on repeated staff failures | Not implemented; fixed windows only. |
| Edge abuse control for cached public reads | Still the in-memory middleware limit (best effort, per instance); a platform firewall rule (Vercel WAF) is the durable option. |
| Keyed-hash rotation | Manual (change the secret); not scheduled. |
| Migration 0018 on production | Your approval. |

---

## Prompt 11 — Cached public pages and client-side interaction (8 October 2026)

### Rendering audit

| Page | Rendering | Cache-Control served |
| --- | --- | --- |
| `/`, `/collections`, `/products/[slug]` (27) | ISR, 60 s | `s-maxage=60, stale-while-revalidate` |
| `/journal`, `/journal/[slug]` | ISR, 300 s | `s-maxage=300, stale-while-revalidate` |
| Policies, contact, `/routine-finder`, `/wishlist` | Static | `s-maxage=31536000` |
| `/sitemap.xml` | **Was static forever; now ISR hourly** and refreshed on article publish | |
| Account, checkout, orders, sign-in, staff, track order, private APIs | Dynamic | `private, no-store, max-age=0` (now also stamped by middleware) |

No layout or middleware reads the session or database for public pages: middleware only checks the staff cookie on staff paths, and the account menu and delivery address load client-side. Interactive work stays in client components: the quiz and routine calculation (`/routine-finder`, static), collection filters and sort, the bag and its quote, product-page size and quantity. Prices and stock for product cards come with the cached page (one batched read per regeneration), never one request per card.

### Changes

| Change | Why |
| --- | --- |
| **Sentry loaded on demand** (`instrumentation-client.ts`, `global-error.tsx`) | A static import put the Sentry SDK in every page's bundle, on every visit, whether or not a DSN was set. With no DSN at build time it is no longer shipped at all; with one it loads as a separate chunk after the page. **Shared first-load JS 195 KB → 103 KB; home 225 KB → 134 KB** (Next.js build figures). |
| **Collections server HTML** | The page read `useSearchParams` and its Suspense fallback was a skeleton, so the static HTML held **no products** (0 images): crawlers and first paint saw an empty shop. The fallback is now the full unfiltered grid; URL filters apply in the browser. |
| **No server cart for an empty bag** | The bag mirror posted on every first visit, creating a cart row with five database writes per visitor, bots included. It now skips an empty bag that was never mirrored; clearing a mirrored bag still syncs. |
| **Session not refetched on window focus** | Sessions are database-backed; focus refetches doubled the session calls per page view. |
| **Quote client** (`lib/quote-client.ts`, `use-cart-quote.ts`) | Identical in-flight requests are shared; a current quote is reused; aborting one caller detaches only that caller, and the request stops when none remain; expiry is measured on the server's clock (`Date` header vs `validUntil`), clamped to 5–60 s, so a device with a wrong clock neither trusts an expired quote nor refetches in a loop; the bag refreshes once when a quote expires while open; an expired quote is never shown as confirmed. Requests for one SKU set never overlap, so an older quote cannot replace a newer one. |
| **Private-cache isolation** (`lib/cache-policy.ts`, middleware) | `private, no-store` + `Vary: Cookie` on every personal page and API, independent of how the page is rendered. |
| **Sitemap** | Hourly ISR and revalidated with article publishes (a new article was invisible to search engines until a redeploy). |
| **Opt-in query log** (`DB_LOG_QUERIES=1`) | Statement prefix only, never parameters; used for the measurements below. |
| **`scripts/measure-pages.mjs`** | Measures any running build: cache state, HTML and asset transfer per page, private-path headers. |

Prices shown in the browser remain provisional; checkout re-prices on the server (prompt 2).

### Measurements (production build, `next start`, Neon rehearsal branch; local, not the live deployment)

| Page | HTML (gzip) | JS + CSS referenced, gzip (before → after) | Repeat request |
| --- | --- | --- | --- |
| `/` | 20.0 KB | 283.7 → **195.1 KB** | HIT |
| `/collections` | 7.1 → 13.3 KB (now contains the products) | 283.4 → 194.7 KB | HIT |
| `/products/retinol` | 11.9 KB | 285.8 → 197.1 KB | HIT |
| `/routine-finder` | 7.2 KB | 293.9 → 205.2 KB | HIT |
| Policies, journal | 6.5–8.0 KB | 278.4 → 189.8 KB | HIT |

(Gzip measured by compressing each referenced asset; `nomodule` polyfills excluded. CSS is 11.5 KB of each total.)

| Activity | Result |
| --- | --- |
| Database queries for 14 public page requests | **0** (served from the cache); the only queries seen came from ISR background regeneration and from `/checkout`, which reads fresh prices and stock by design |
| Database queries at build | 67 (prerendering 27 product pages, home, collections, journal) |
| First anonymous home visit, uncached API calls | `/api/account/deliver-to`, `/api/wishlist`, `/api/auth/session` (twice before the focus fix); none touch the database for an anonymous visitor. Before the mirror fix it also posted `/api/cart` with **5 database writes** |
| Bag open for 66 s | One quote request on opening, one at expiry (3 s and 63 s): no loop |
| Private paths | All `private, no-store, max-age=0`; `measure-pages` exits non-zero if any becomes shared-cacheable |

### Verification

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 20 warnings |
| Tests | **57 files, 689 passed, 3 opt-in skipped** (7 quote client: sharing, reuse, per-caller cancellation, failed refresh not poisoning the next, server-clock expiry with a 10-minute-fast device, lifetime clamps, refetch after expiry; 32 rendering policy: private paths, public paths, publication invalidation for product copy, articles and price/stock changes, no static vision imports, no vision dependency) |
| `npm run build:offline` | Pass (shared 103 KB, home 134 KB) |

### Vision

No vision or model library is installed; the skin-analysis module is a server-side interface with no analyzer. A test fails if any source file statically imports a vision package (TensorFlow.js, MediaPipe, ONNX Runtime Web, Transformers.js, face-api, OpenCV): the scanner must load them with `await import()` after the customer enters scanning.

### Remaining performance issues

| Issue | Note |
| --- | --- |
| JS + CSS about 195 KB gzip per page | Over the spec's 180 KB JS budget by a little once the runtime chunks are counted; the largest remaining chunks are React DOM (53 KB) and the shared app chunk (45 KB). Next step: audit client components in the root layout (header mega-menu, account menu, cart drawer) for code that could load on interaction. |
| Production Sentry | If `NEXT_PUBLIC_SENTRY_DSN` is set on Vercel, the SDK still downloads, but after the page rather than blocking it. Not verified against the live environment. |
| Home HTML 241 KB raw (20 KB gzip) | 80 KB is image `srcset` lists (44 images × all device sizes) and 21 KB inline SVG. Trimming `images.deviceSizes` for desktop would help; deferred with mobile. |
| Uncached calls per anonymous page view | Delivery address, wishlist and session checks run for visitors who are not signed in. A non-secret "signed in" hint cookie would let the browser skip them. |
| Availability quote CDN cache | `s-maxage=15, stale-while-revalidate=30`: a price change can take up to about 45 s to reach the bag; checkout always re-prices. |
| Knowledge releases | Nothing reads the active release yet, so activation needs no cache invalidation; add it when inference moves to releases. |
| Real-user metrics | LCP, INP and CLS were not measured here (local, desktop, no field data). |

---

## Prompt 12 — Cart and wishlist account synchronisation (8 October 2026)

### Behaviour

- **Merge policy** (`src/lib/cart-merge.ts`): per SKU, the larger of guest and account quantity (never the sum, so retries and repeated sign-ins cannot add anything), then capped at the 10-per-SKU purchase limit and at counted stock; SKUs no longer sold are dropped. Every cap or drop is shown in the bag ("Your bag was combined with your account's"). Wishlists are unioned.
- **Server merge** (`mergeIntoAccount`, `POST /api/sync/merge`): one transaction locking the account's cart row; folds in the browser's guest bag and the server-side guest cart (from the request's own cookie, never one named in the body), deletes that guest cart in the same commit, merges the wishlist. Both sign-in paths (Google event, password/code `createCustomerSession`) now use it.
- **Reading back** (`GET /api/sync`): the account's saved bag and wishlist, plus an opaque account key; a guest gets nothing private and costs no database read.
- **Identity reconciliation** (`src/lib/account-sync.ts`, `store.tsx`): on load, on focus (at most every 30 s), on another tab's change and on an explicit event. Same account: adopt the server copy unless local changes are unsent. Guest state on sign-in: merge. Sign-out: the account's bag and wishlist are cleared from the browser. Another account: the previous one's state is discarded, never merged. A newer check cancels an older one.
- **Ownership on writes**: bag and wishlist saves carry the account key; the server refuses (409) a save for a different account, and the browser re-checks instead of writing one account's bag into another's. Nothing is mirrored before identity is known.
- **Failures**: a failed check or merge changes nothing; the guest bag stays in the browser (and the server guest cart is not deleted) and the next check retries.
- **Storage**: guarded helpers moved to `src/lib/safe-storage.ts`; owner is also kept in memory, so a browser with storage disabled syncs correctly for the visit.
- Server saves now drop unknown SKUs and use the bag's purchase limit (was 20).

### Tests and results

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 20 warnings |
| Tests | 718 passed, 3 opt-in skipped, **1 failure in the full run**: the launch-check test in `content-claims.test.ts`, which scans the whole source tree; it passes alone (25/25) and looks like a timeout under full-suite load. Not yet investigated further. |
| New tests | 16 pure (merge policy, idempotence, caps, every sync decision including same-page account change, disabled storage, corrupt JSON) and 14 integration through the routes (empty and existing account carts, guest server cart transferred once, 4 repeated merges, concurrent merges, stock and limit caps, guest gets nothing, each account reads only its own, merge refuses guests and invalid lines, cookie not taken from the body, cross-account save and wishlist refused with nothing written, stale tab refused, failed merge rolls back and a retry succeeds) |
| Mutation checks | Summing quantities: 5 failures. No account guard: 2. Merging another account's bag: 1. All restored. |
| Found by tests | A guest pre-merge applied the purchase cap and discarded its explanation (fixed). Two older tests used a SKU that does not exist (centella 150ml; fixed to 100ml). |

### Not done (usage limit reached)

- Browser verification of sign-in merge and sign-out clearing; `npm run build:offline`.
- Investigation of the intermittent launch-check test failure.
- No React component tests (no testing library installed); the store is covered through its pure parts and the routes.

---

## Prompt 13 — Lightweight Bayesian inference core (8 October 2026)

### What was built

`src/modules/personalization/core/bayes.ts`: one pure module for browser and server. It has no database, network, clock, randomness or Node API, and only type imports.

| Function | Behaviour |
| --- | --- |
| `inferConcerns(parameterSet, observations, reportedPriorities)` | Per concern, log-odds = logit(prior) + the sum of ln(P(e given concern) / P(e given not concern)) over accepted observations; probability through a sigmoid that is stable at both extremes. Returns priorities (calibrated concerns by probability, then the rest in the order the customer reported), a per-concern decision trace and the inference version. |
| Neutral evidence | Missing, quality-rejected, unsupported (no likelihood row) and out-of-calibration-scope observations add nothing, and are traced with their reason. Evidence about a group the concern has no parameters for is ignored. |
| Correlated evidence | One contribution per evidence group. Observations are put in a fixed order (group, quiz before photo, value), so which duplicate counts never depends on input order; the rest are traced as `duplicate_in_group`. |
| Calibration scope | New required field on parameters: `calibrationScope` (sources; photo model versions). A photo observation counts only from a model version in scope. Observations are categorical; any numeric confidence on them is never read, so a raw model score cannot become a likelihood. |
| Validation | Release schema must be supported (v1). Priors and likelihoods must be finite and strictly between 0 and 1; no duplicate concern or likelihood row; a calibration scope is required. Any problem leaves the whole set unused. The release compiler (prompt 9) also checks the scope. |
| Fallback | Only `validated` parameters produce a probability. With none (today), or with `provisional` or `synthetic_fixture` parameters, or with invalid ones, the result is `basis: 'reported'`: the customer's own priorities in their order, and no percentage anywhere in the output. |
| `readParameterSet(manifest, artifact)` | Reads `parameters.json` from a knowledge release; refuses development fixtures unless explicitly allowed. |
| `combineWithSafety(inference, safety)` | Exclusions come only from the safety rules evaluated on the profile (`applyRules`, prompt 9). Inference takes no safety answers and returns no exclusions, so no concern score can lift one. |

The earlier `posterior` helper in `modules/knowledge/inference.ts` was removed, leaving one implementation; its test now goes through the core.

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 20 warnings |
| Tests | **60 files, 749 passed, 3 opt-in skipped** (30 new inference tests) |
| `npm run build:offline` | Pass (shared JS unchanged, 103 KB) |
| Synthetic arithmetic (**test values only**) | Prior 0.20 and ratio 3 gives 0.428571; a further independent ratio 2 gives 0.60; log-odds equal ln 0.25 + ln 3 + ln 2 |
| Browser/server parity | The module is bundled by esbuild for the browser, checked to contain no `require`, `process`, `fetch` or `node:`, run in a bare `vm` context with no Node globals, and produces byte-identical JSON to the server import for four cases (calibrated, duplicates, no parameters, unsupported schema) |
| Neutral evidence, duplicates, scope, raw confidence, validation (7 invalid cases), fallback, numerical extremes (60 near-certain ratios each way; sigmoid at ±1000), determinism under reordering, safety independence | All tested |
| Mutation checks | Duplicate guard removed: 2 failures. Provisional treated as calibrated: 1. Naive odds instead of the stable sigmoid: 1 (NaN at the extremes). Scope check removed: 2. All restored. |
| Runtime LLM or model dependency | None added (`package.json` has no LLM, embedding or model-training package) |

### Data needed before any parameter can be `validated`

| Need | Detail |
| --- | --- |
| Consented, labelled outcomes | People who agreed to research use (consent purpose `model_research`, prompt 8), with each concern labelled by a qualified assessor, not inferred from purchases or self-report alone |
| Evidence groups | The final list of quiz questions and photo categories grouped by what they measure, so correlated items share a group |
| Fitting | Categorical likelihoods per group and value with Laplace smoothing; priors from the target population; person-level train/test split (no person in both) |
| Calibration | Held-out reliability, Brier score and log loss, per supported skin tone and device cohort; `calibrationVersion`, `trainingVersion` and counts recorded on each parameter |
| Photo scope | For every photo model version: its categories, quality gates and the cohorts it was evaluated on; a new model version needs its own calibration |
| Review | Each parameter set approved through the release review (prompt 9) before it can be published |

### Remaining validation gaps

- No validated parameters exist, so every live result is `reported`; the calibrated path is exercised only with labelled test values.
- The routine finder does not call the core yet; switching the recommendation flow to release-based inference belongs to later prompts. Prompt 7 (shared typed contracts) is still not done.
- The parity test uses esbuild, which is installed as a dependency of tsx rather than declared directly; declare it if tsx ever stops shipping it.
- Joint likelihoods for correlated groups (as opposed to one representative observation) are not implemented; the spec allows either.

---

## Prompt 14 — Product selection: safety, budget and owned products (8 October 2026)

### What was built

| File | Purpose |
| --- | --- |
| `src/modules/personalization/core/selection.ts` (pure) | `selectProducts(input)`: hard eligibility, then owned products, then normalised ranking, then filling within budget and step limits |
| `src/data/routine-roles.ts` | Explicit routine role per product (`cleanse`, `moisturise`, `protect`, `treatment`, `optional`, `none`). The catalogue `category` cannot be used: the sunscreen, the sun stick and the lip mask are all `moisturizer`, and the enzyme exfoliant is a `cleanser`. Product categorisation, not a clinical rule. |
| `src/modules/personalization/service/offers.ts` (server) | Authoritative offers per SKU id: fresh price through the shared pricing rule (owner overrides and live offers) and counted stock; an uncounted SKU is not sellable, as at checkout |

### Order of operations

1. **Hard eligibility per product**, each refusal with a code, a rule id and a sentence. A refused product never reaches ranking, so no weight can overpower it (tested with concern-fit weight 1000).
   - Allergy: absence of an allergen is proven only from a **complete** formulation; partial or unknown coverage is `allergy_unverifiable`. An allergy with no named ingredients cannot be checked, so nothing is recommended (`allergens_not_specified`).
   - Conflicts: an established (tier 2) interaction between a product's possible ingredients and anything the customer already uses excludes it.
   - Treatments only: irritation, very high reactivity, retinoid with pregnancy or nursing not answered "no", retinoid without a confirmed adult age, a prescribed treatment (from the answer or an owned prescribed item), **any unknown safety answer**, approved release rule exclusions (`applyRules`), owned products with unknown ingredients (an active cannot be checked against them), and readiness (approved directions plus complete formulation, prompt 6).
   - Unknown answers are kept as unknown and listed in `unknownSafetyAnswers`. They block elective treatments, never essentials.
2. **Availability**: only SKUs with counted stock above zero and a positive whole-paise price; the cheapest available size of each product.
3. **Owned products first**: an owned item for an essential role fills it (not if prescribed, not if it contains a named allergen); one with unknown ingredients is kept with a note.
4. **Ranking** (configurable, normalised to sum to 1; proposed weights 0.50 concern fit, 0.25 tolerance, 0.15 affordability, 0.10 owned compatibility, needing evaluation against expert-approved examples). Concern fit is by the customer's priority order; tolerance lowers elective-irritating products for reactive skin; affordability is relative to the cheapest in the role; owned compatibility drops for unverified owned items and for tier 3 or 4 interactions. Scores are rounded to 6 decimals and ties broken by price, then SKU id. Margin and co-purchase counts are not inputs.
5. **Filling**: essentials in the order moisturise, protect, cleanse (so a short budget buys the most important first), each the best-ranked option that fits the remaining budget; then at most one elective treatment (and never more than the rules' limit) in its approved session; then at most one optional addition matching a priority, separately flagged. Every purchase fits the budget in integer paise and appears once; each session stays within `maxDailySteps`.
6. **Honest results**: `complete`, `partial` or `no_match`, unfilled slots with the reason (`no_eligible_product`, `over_budget`, `no_eligible_treatment`), and every excluded product with its reasons.

**Substitution** re-runs the same selection with the removed product excluded, so an alternative passes exactly the same checks, or the slot is honestly unfilled.

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 20 warnings |
| Tests | **61 files, 781 passed, 3 opt-in skipped** (32 new selection tests) |
| `npm run build:offline` | Pass (shared JS 103 KB) |
| Mutation checks | Partial formulation passing the allergy check: 1 failure. Owned products not preferred: 3. Budget ignored for essentials: 2. Uncounted stock treated as sellable: 1. Excluded treatments let into ranking: 9. All restored. |

Tests cover: sold-out and uncounted SKUs, another size as fallback; zero, tight and insufficient budgets (spend never exceeds the budget, always whole paise); owned products used first, an owned-only routine at zero budget, owned items with allergens or unknown ingredients; allergy exclusions with and without complete formulations, and unnamed allergies; incomplete formulations; unknown answers; weights against hard exclusions; release rules and a treatment limit of 0; prescribed treatments; step limits; substitution (an alternative, none, an unavailable one); weight normalisation; determinism under reordered inputs; priorities changing the top choice; every product having a role. Formulations, directions and interaction rules in tests are labelled synthetic test data.

### Limitations

- **With today's knowledge** (no complete formulations, no approved directions), treatments are always unfilled, and anyone who reports an allergy gets an honest no-match: nothing can be shown free of the allergen.
- The conservative eligibility checks (`builtin:` rule ids) are engineering assumptions, the same as prompt 3's, pending clinician review; approved release rules add to them and cannot relax them.
- Interaction checks use the five existing rules, which are unreviewed; using them to exclude is the conservative direction.
- Concern ids: ranking matches the catalogue's concern tags; mapping the specification's concern ids (`blemish_appearance` and so on) to them belongs with the typed contracts (prompt 7, still not done).
- Tolerance and owned-compatibility terms are simple proposed functions; all four weights need evaluation.
- Not yet wired to the routine finder (the current engine from prompt 3 still runs); weekly planning is prompt 15 (done).
- Spec section 15 also asks that each likelihood distribution sums to one; the prompt 13 validation does not yet check this.

## Prompt 15 — Weekly routine planner (8 October 2026)

### What was built

| File | Purpose |
| --- | --- |
| `src/modules/personalization/core/planner.ts` (pure, browser-compatible) | `planWeek(selection, ctx)`: seven days, each with ordered AM and PM slots, built from a prompt 14 selection (owned and catalogue products). `validatePlan`, `applyEdit`, `describeSchedule`, `spreadDays`. |
| `src/data/product-directions.ts` | Optional `introductionWeeklyUses` on approved directions (the starting pace). Validated in `knowledgeProblems` to lie between 1 and `maxWeeklyUses`. None is set: no approved directions exist. |
| `src/modules/personalization/core/selection.ts` | `possibleIngredients` and `conflictTier` exported, so the planner uses exactly the selection's ingredient and interaction checks. |

### How a week is built

1. **Essentials** (owned or catalogue) every day, in their role's sessions: cleanse AM and PM, moisturise AM and PM, protect AM. A catalogue essential with no approved directions is placed by role, and the missing directions are listed.
2. **Treatments** only with approved directions that state `maxWeeklyUses`. Otherwise the treatment is excluded with `frequency_missing`, and no frequency is invented. Uses per week = the approved introduction pace if set, else the maximum (never above 7). Session = the approved session (PM unless the directions say AM only).
3. **Placement is a bounded greedy search with limited backtracking.** Uses are spread evenly (`spreadDays`: 3 uses → Mon, Wed, Fri). If any day fails validation, the pattern is shifted by one day, up to 7 offsets. If none validates, the treatment is excluded with `cannot_schedule`. Alternating nights are real slots on real days, never a note.
4. **At most one optional addition** per evening, only where the full week still validates. It stays marked `optional` in the slots and the purchases.
5. **The whole week is validated**, owned products included:
   - Steps per session ≤ `maxDailySteps`; positions sequential; role order (cleanse, optional, treatment, moisturise, protect).
   - Treatments need approved frequency and session; no irritating active while irritation is not "no".
   - At most one irritating active per session; no interaction of any tier between two products in the same session.
   - Weekly uses ≤ the approved maximum.
   - An unresolvable conflict between essentials is reported in `problems`, and the plan is `partial`.
6. **Purchases** are only the SKUs actually scheduled, deduplicated, with `newSpendPaise` recomputed (always ≤ budget). The essential/optional flag is preserved.
7. **Status:** `no_match` when no essential could be placed; `complete` only with all three essentials, a complete selection and no problems; otherwise `partial`.

**Schedule text** is generated from the slots, for example "Label: Monday, Wednesday, Friday evenings.", so it always describes the actual schedule.

**Explanations** map the decision trace's exclusion codes (irritated, very reactive, pregnancy or nursing, age) to template ids. Text is rendered only from an **approved** template; otherwise `text` is null and the template is listed in `missingKnowledge`.

**Revalidation:**
- **Edits** (`applyEdit`: remove a step, move a treatment to another day) re-run `validatePlan` and are refused with the problems, leaving the plan unchanged.
- **Substitutions and budget changes** re-run `selectProducts` and then `planWeek`, so they pass the same checks as the first plan.

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 19 warnings |
| Tests | **62 files, 807 passed, 3 opt-in skipped** (26 new planner tests) |
| `npm run build:offline` | Pass (shared JS 103 KB) |
| Mutation checks | 10 mutations, every one caught, all restored:<br>- Step cap removed: 1 failure.<br>- Weekly maximum removed: 1.<br>- Same-session conflicts ignored: 2.<br>- Two irritants allowed together: 2.<br>- Irritation ignored: 1.<br>- Introduction pace ignored: 1.<br>- Backtracking removed: 2.<br>- Draft templates rendered: 1.<br>The step-cap and draft-template mutations first survived. That exposed two test gaps (selection already caps steps; the test passed no templates), and both tests were strengthened. |

Tests cover:
- Seven ordered days; today's honest plan with no treatment and a reason.
- An approved 3-a-week treatment on three spread evenings with its directions verbatim; schedule text; introduction pace; AM-only session; missing frequency (excluded, nothing invented, not purchased); weekly maximum.
- Two irritating actives on different evenings; a treatment that cannot fit without a conflict dropped with a reason; irritated skin.
- An essential conflict reported as partial; step caps 3–5 and a forged over-cap week.
- Optional flags; budgets 0 to ₹5,000 (spend ≤ budget, deduplicated, purchases all scheduled); zero-budget no-match; substitution.
- Edits accepted and refused; draft vs approved templates; determinism under reordered inputs.
- **Inferred concern scores cannot bypass safety:** an inference strongly favouring the retinoid's concern still leaves it excluded for an unknown pregnancy answer.

All frequencies, formulations and interactions in tests are labelled synthetic test data.

### Missing knowledge that prevents fuller plans

- **Approved directions per treatment**: session, `maxWeeklyUses` and, where wanted, an introduction pace. Without them every treatment is left out, so every plan today is essentials only.
- **Approved directions per essential**: they are placed by role, with pack directions.
- **Complete, reviewed formulations**: needed for treatment readiness, allergy checks and interaction checks between products.
- **Reviewed interaction rules**: the five existing rules are unreviewed; using them to separate products is the conservative direction.
- **Approved explanation templates**: all six are drafts, so explanations carry template ids and variables but no text.
- **Escalation over weeks** (moving from the introduction pace to the maximum) needs an approved rule; the planner plans one week at the given pace.

### Limitations

- Not yet wired to the routine finder or a private API (prompt 16).
- Only one optional addition per evening; at most one treatment comes from selection (its rule).
- Role order is a product categorisation for ordering, not a clinical layering rule; approved per-product layering would replace it.

## Prompt 16 — Private routine APIs and server recomputation (8 October 2026)

### What was built

| File | Purpose |
| --- | --- |
| `src/modules/personalization/contracts.ts` (pure) | Strict zod contracts: `SkinProfileV2` (spec section 12, with its caps: 3 unique priorities, budget 0 to ₹10,000 in whole paise, 20 owned items, 50 ingredients each, 30 allergy ids), the save request (profile, release id, optional scan id), weekly feedback, and a hosted scan's stored `ObservationV1` list. Unknown keys are rejected everywhere. Also `CONCERN_CATALOGUE_TAGS`, the categorisation from the spec's concern ids to catalogue tags for ranking (not a clinical mapping). |
| `src/modules/personalization/core/routine.ts` (pure, browser-compatible) | `computeRoutine`: inference → release rules → selection → weekly planner, everything clinical read from one release. Returns the versioned `RoutineSnapshot` (engine `select-plan-2026-10-08`, inference `bayes-logodds-1`, release id, photo model versions). |
| `src/modules/personal/routines.ts` (server) | `insertRoutine` (profile, snapshot and normalised schedule in one transaction, under an advisory lock on owner and key), `replay`, `getRoutine` (with validity), `listRoutines`, `deleteRoutine`, `addFeedback`, `scanObservations`, `claimGuestRecords`, `purgeExpiredRoutines`. |
| `src/modules/personal/routine-http.ts` (server) | One error shape `{ error: { code, message, requestId, fieldErrors?, details? } }`, private no-store responses with `Vary: Cookie`, and owner resolution (session, else guest cookie hash), including the guest claim. |
| `POST/GET /api/routines`, `GET/DELETE /api/routines/[id]`, `POST /api/routines/[id]/feedback`, `POST/DELETE /api/consent` | The private API. |
| `drizzle/0019_routine_api.sql` (additive) | `routine_results`: `inference_version`, `idempotency_key`, `request_hash` (set together), unique per owner and key. New `routine_schedule_slots`: one row per step (day 1–7, AM/PM, position, role, optional flag, exactly one of product plus SKU or owned item), deleted with its routine. |
| `src/app/routine-finder/actions.ts` | `persistRoutine` no longer accepts or stores the browser's result; it records only the aggregate event. Nothing was lost: no consent could be granted before this prompt, so it never saved. |
| Rate limits, body limits, cache policy, sweep | Policies `routineRead` (60/min, open on outage) and `consent` (10 per 10 min, closed); body limits 17 KB routine, 1 KB feedback and consent; `/api/routines` and `/api/consent` private; the daily sweep deletes expired routines and saved answers. |

### Behaviour

- **Server recomputation.** The body carries inputs only. The server:
  1. Loads the active release; none is a 503, a different one is a 409 naming the active release.
  2. Reads current prices and stock; failure is a 503.
  3. Resolves scan observations.
  4. Runs `computeRoutine`.

  A client result, price or eligibility decision cannot be sent (strict schema) and is never stored.
- **Scans.** Observations are read only through a scan id the owner owns: hosted, `completed`, unexpired and under live photo consent. Foreign, missing, expired, withdrawn or unfinished scans are all the same 404. Only `accepted` observations count (`uncertain` is neutral). Without validated parameters, observations change nothing and priorities stay as reported. Quiz-only saving needs no scan.
- **Ownership.** The account, or the guest's HttpOnly secret (only its SHA-256 is stored). Every read, write and delete is scoped to the owner; another owner's id is a 404, and deletion always answers 204. A guessed cookie value is not ownership.
- **Guest to account.** The first routines or consent request after sign-in claims everything the guest owns, in one transaction:
  1. Consent records are append-only, so each active guest grant is carried over as an account grant under the same policy version (or joins the account's existing grant).
  2. Profiles, routines and scans are repointed to it.
  3. The guest grant is withdrawn and the guest cookie dropped.

  An idempotency key the account already used is cleared on the guest copy. The claim is idempotent, and a failed claim moves nothing.
- **Consent, quotas, bodies, caching.** Saving needs active routine-saving consent, checked in the route and again inside the insert transaction; the database's triggers also refuse a withdrawn grant. Durable quotas:
  - 5 saves a minute and 20 a day per owner, plus per trusted IP (fail closed).
  - Feedback: 5 an hour.
  - Reads: 60 a minute.
  - Consent: 10 per 10 minutes.

  Bodies are bounded (413). Every response is `private, no-store`.
- **Idempotency.** `Idempotency-Key` is required. An identical retry returns the original routine (200), even if prices have changed since; the same key with a different request is a 409. Concurrent retries serialise on an advisory lock and create one routine; a unique index backs this up.
- **Snapshot and schedule** are written in one transaction with the engine, release, inference and photo-model versions, the request hash and the profile. Guest routines are kept 30 days, account routines 180.
- **Validity.** Expired or consent-withdrawn routines are never returned. A routine whose release is no longer active is `outdated` (recompute to refresh). One whose release was revoked is `revoked`: the record stays for traceability, but `result` is withheld so it is never shown as a recommendation.
- **No valid plan** is a 422 carrying the honest no-match result; nothing is saved.
- **Feedback.** Accounts only (the table requires a user), bounded enums, once per week, owner only, and tied to the routine's release (409 if stale).

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 19 warnings |
| Tests | **63 files, 833 passed, 3 opt-in skipped** (26 new route-level integration tests on real migrations) |
| `npm run build:offline` | Pass (shared JS 103 KB) |
| Mutation checks | 7 of 8 caught, all restored:<br>- No replay inside the lock: 1 failure.<br>- Key conflict ignored: 1.<br>- Retrieval unscoped: 5.<br>- Scan expiry ignored: 1.<br>- Revocation ignored: 1.<br>- Guest grant kept on claim: 2.<br>- Request schema not strict: 1.<br>The survivor is the route's early consent check, which is deliberately redundant: the insert transaction checks again. |

Tests cover:
- Guest and account creation with versions and retention.
- No consent and no owner.
- Tampered bodies: a client result, prices, safety decisions, duplicate priorities, fractional paise.
- Server-side prices; stale and missing releases; no-match 422.
- Missing key, foreign origin, oversized body; the durable save quota (429 with Retry-After).
- Identical retries after a price change; conflicting keys; three concurrent retries; per-owner keys.
- Foreign ids for another account, another guest, nobody and a guessed cookie.
- Retrieval after reload, with the schedule rebuilt from rows; idempotent deletion.
- Consent withdrawal; expiry and the sweep; outdated and revoked releases.
- Feedback rules; owned, foreign, expired, unfinished, unknown and withdrawn scans.
- The guest claim: new grant, existing grant, failure rolls back.

### Remaining integration gaps

- **No UI uses the API yet.** The routine finder still shows the prompt 3 engine's result and saves nothing. Wiring the finder to `computeRoutine`, the consent prompt and saving is prompt 17. Until then, what is shown and what would be saved come from different engines.
- **No published release in production.** Saving answers 503 until a release is published (rehearsal had one). With today's approved knowledge every saved plan is essentials-only (prompt 15).
- **The quiz does not collect `SkinProfileV2`.** Nursing, irritation, allergies, prescribed treatments, budget, step limit and owned products are not asked yet; prompt 17 has to add them, with "unknown" for skipped answers.
- **Concurrency on PostgreSQL.** The advisory lock and unique index were tested on PGlite, which serialises connections. A real multi-connection race (like prompt 10's opt-in test) is not yet written.
- **Release rules** see only profile fields with an exact equivalent: skin type, reactivity, pregnancy, under-18 and current irritation. Experience, sun exposure and the rest are unset, so no rule matches on a guess.
- **Repository interaction rules.** The five unreviewed rules are added to the release's approved interactions in `computeRoutine`. They are conservative, but they are not part of the release, so a browser must ship the same constants for parity.
- **Scans.** No scan API or worker exists yet (prompts 21 onward); the scan path is exercised with database rows only.
- **Withdrawal leaves rows in place.** Routines stay stored but hidden until they expire or are deleted. Whether withdrawal should also delete them at once is a policy decision for the owner.
- **Migration 0019** has not been applied to the rehearsal branch or production.

## Prompt 17 — Desktop routine finder and results (8 October 2026)

### What changed

The finder no longer uses the prompt 3 engine (`getRecommendation`). It now runs the shared `computeRoutine` (prompt 16) in the browser, on the same release and the same function the server uses to save.

| File | Purpose |
| --- | --- |
| `src/app/routine-finder/quiz.ts` (pure) | The questions and `toProfile(answers) → SkinProfileV2`:<br>- Up to three priorities.<br>- Skin type, reactivity, irritation, age, pregnancy, breastfeeding, allergies (with an ingredient list), prescribed treatment: each with "not sure" or "prefer not to say", and skippable. Every unanswered safety question stays `unknown`.<br>- Experience, how regularly, routine size (3/4/5 steps), budget (whole rupees, 0 to 10,000) and owned products are separate required steps.<br>- An allergen not in the dictionary leaves the allergy unspecified, so no new product is suggested. |
| `src/app/routine-finder/routine-session.ts` | The controller, outside React:<br>- Release and fresh price quote.<br>- Recompute on answers, budget, swap and price refresh. Each gets a generation and aborts the last, so an earlier answer can never reach the screen.<br>- Save: consent grant, then `POST /api/routines` with inputs only and one idempotency key reused on retry. The server's result then replaces the provisional one.<br>- Reload by id; readable messages for every failure. |
| `quiz-view.tsx`, `results-view.tsx`, `page.tsx` | The desktop interface (below). |
| `src/app/api/catalog/release/route.ts` | Public release for the browser engine (spec section 20). Until one is published, it compiles the repository's approved knowledge and marks it `published: false`, so the quiz works as a session-only preview. |
| `core/routine.ts`, `contracts.ts`, `routines.ts`, `api/routines` | Substitutions (`excludeProductIds`, also accepted and applied by the save API); inclusion reasons, unfilled slots and exclusion messages in the snapshot; swapped products recorded; `GET /api/routines/[id]` returns the owner's own saved answers so an outdated routine can be recalculated. |
| `.env.example` | `NEXT_PUBLIC_FACE_SCAN`: the optional scan entry stays hidden unless set. No scan flow exists, so leave it unset. |

### The interface (desktop)

- **Intro.** Start the questions; the owner's saved routines with their state and expiry; an explanation when a saved link is no longer available (expired, deleted, consent withdrawn, or another browser or account).
- **Quiz.** One question per screen.
  - Native radios and checkboxes in a `fieldset` with a `legend`; focus moves to each question's heading.
  - Enter picks and continues; Back keeps every answer; skip on safety questions.
  - Validation messages are linked to the field (`aria-invalid`, `aria-describedby`, `role="alert"`). Progress counts only the questions shown.
- **Results.**
  - Title by status: complete, partial or no match.
  - A save badge: "Not saved: this visit only", "Saving…", or "Saved to your routines".
  - **The week:** the generated schedule text, plus a real seven-day table of ordered morning and evening steps.
  - **Products:** essentials, "Already yours" and optional additions, each with its SKU size, current price, inclusion reasons and approved directions. Where none are published it says so and points to the pack; nothing is invented.
  - Per-product add to bag and swap; undo swaps.
  - **Totals and budget:** essentials, optional additions, total new spend against budget, add essentials to bag, and a budget form that recalculates the whole week.
  - **Not included, and why:** unfilled steps and every excluded product with its reasons.
  - **What we are unsure about:** reported-only priorities, unknown safety answers, plan problems, and knowledge still under review.
- **States.**
  - Loading and recalculating, with the previous plan dimmed and `aria-busy`.
  - No match, with reasons and what to change.
  - Partial plan.
  - Stale prices: after the quote expires, "Prices may have changed" with a refresh. A price change on save is pointed out.
  - Quota: "try again in N seconds".
  - Network and price errors keep the routine on screen.
  - Unpublished-release preview: saving is explained as unavailable.
  - Saved but outdated (recalculate) and revoked (result withheld; recalculate from saved answers).
  - Failed save: keeps the result, offers "Try saving again".
- **Reload.** A saved routine's id goes in the address bar (`?saved=`), so a reload fetches it again as the owner.
- **Style.** Large serif headings, off-white panels, pill buttons and generous spacing, using the site's existing tokens. The full Nuvē landing replica is prompts 19–22.

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 17 warnings |
| Tests | **65 files, 852 passed, 3 opt-in skipped** (8 quiz tests; 11 controller tests through the real release, consent and routine routes on real migrations) |
| `npm run build:offline` | Pass. `/routine-finder` first load 165 KB (it now ships the shared engine, catalogue and contracts); shared JS 103 KB |
| Mutation checks | All 5 caught, all restored:<br>- New idempotency key on retry: 1 failure.<br>- Unavailable saved routine not explained: 1.<br>- Server result not adopted after save: 1.<br>- No cancellation at all: 1.<br>- Generation guard and abort removed together: 1.<br>Each guard alone is redundant with the other by design.<br>The first versions of the cancellation and server-result tests could not fail. The tests now record every result shown and use a quote cheaper than the server's price. |

Tests cover:
- Beginner flow: a seven-day essentials plan within 3 steps, session-only, with reasons.
- Zero budget with owned products: a routine from what they own, nothing to buy.
- Restrictive profile: honest no-match with reasons and unknown answers.
- Substitution and undo, revalidated.
- A budget change racing an earlier one: the earlier never shows.
- Failed price refresh keeps the plan.
- Save failure then retry with the same key, one row; quota message.
- Server result replacing the provisional one.
- Reload in a new controller; expired and foreign saved routines reported unavailable.
- Unpublished release: a working preview, and an explained save refusal.
- Quiz mapping: unknowns preserved, required steps, allergens, owned items, budget validation, conditional questions.

### Limitations

- **Not verified in a browser.** A live check needs a database with stock, a published release and migration 0019. Fetching the rehearsal branch's connection string was refused by the session's permission rules (it writes credentials to disk), so no preview was run. Without a database every catalogue product is unsellable (stock unknown), so only owned-products routines could be shown. Keyboard, focus and 200 percent zoom checks are still to do.
- **Production behaviour today.** No release is published there, so the finder is a session-only preview. Treatments are always left out, because no approved directions or formulations exist; every plan is essentials and optional additions.
- **Owned products** are entered as a name and role only; ingredients are unknown, so active treatments stay out while they are in the routine. Picking owned Avyora products with known formulations is not built.
- **Eye-area and body-care modules, and the adherence answer**, are collected or defaulted but not used by the engine yet.
- **The old engine** (`src/lib/routine-engine.ts`, `questions.ts`) and its tests remain but nothing renders them; remove them once this flow is accepted.
- **Guest saves happen only on request** ("Allow saving and save" grants consent and saves). There is no separate consent screen; the consent text is in the save panel, and its policy version is `routine-saving-v1`.
- **The unpublished preview** compiles repository knowledge on the server once per process.

## Prompt 18 — Knowledge assistant without runtime LLM calls (8 October 2026)

### What was built

| File | Purpose |
| --- | --- |
| `src/modules/assistant/assistant.ts` (pure, browser-compatible) | `buildIndex(release, products)` and `answer(index, question, routine?)`. Pipeline:<br>1. Normalise (NFKC, lowercase, at most 200 characters and 24 tokens).<br>2. A small synonym table (spelling and shorthand only: "vit b3", "HA", "SPF", "moisturizer"; retinal and retinol are never merged).<br>3. Lexical matching: product names weighted by inverse document frequency; ingredient names through the release's alias map, where declared ambiguities win; approved education answers by question-alias overlap.<br>4. Fixed intent cue words.<br>Every answer carries plain-text paragraphs, sources, the release id and whether it is personal. |
| `src/components/assistant/assistant-panel.tsx` | The desktop panel. Questions are answered on the device from `GET /api/catalog/release`. Price questions call the live quote service (`/api/catalog/availability`, rate limited). Order questions open the existing `trackOrder` form (order number and email, rate limited server-side), with a link to account orders. Everything renders as text; source links only for `https://` URLs. |
| `src/app/assistant/page.tsx` | "Ask Avyora": general questions. |
| `src/app/routine-finder/results-view.tsx` | The panel under each routine, loaded lazily, with the routine's snapshot for personal questions. |

### Supported topics

| Topic | Source of the answer |
| --- | --- |
| Ingredient explanations | The release's ingredient identities: INCI name, common name, aliases, class. Cautions only when reviewed, with their sources; otherwise "not reviewed yet, not a statement that it has none". |
| Product directions | Approved usage profiles, verbatim, with evidence sources. None is approved today, so the answer says they are not published and points to the pack. |
| Routine steps | The customer's own schedule: a day and session, or the week. |
| Why a product was included or left out | The routine's decision trace (inclusion reasons, exclusion messages), marked "About your routine", with the routine's release and engine version. |
| Approved education answers | Searchable by question aliases (none approved yet). |
| Price and stock | Live quote per size; "stock not confirmed" when no count exists. |
| Orders | The existing lookup only. Nothing is looked up from the question text. |

**Behaviour:**
- **Clarification** for an ambiguous ingredient ("vitamin c", "retinoid"), a name shared by several products ("toner"), a bare product name, or equally good education answers. The options restate the intent; they never echo the question.
- **Out of scope:** diagnoses, medicines, prescriptions and dosage are refused with a pointer to a dermatologist, even when mixed into a product question. Unsupported questions say so and offer the supported topics.
- **Withheld content:** an approved entry whose sources are missing from the release is not shown.
- **Release validity:**
  - A revoked routine (result withheld) cannot be explained.
  - An outdated routine is explained with a note.
  - A routine on another release names the release it was built on.
  - The release route never serves a revoked release; activation refuses one.

### Privacy and bounds

- **Questions stay on the device.** Answers are computed in the browser, so questions and routine details are never sent to a server, logged, cached or recorded as analytics events. The only requests are the public release (no personal data), the public price quote, and the existing order lookup (POST server action, no caching).
- **Bounds.** Input is capped at 200 characters (also `maxLength` on the field) and 24 tokens; work is linear in tokens times index size. The log keeps the last 20 exchanges.
- **No new dependencies.** No runtime LLM, no vector database and no model training.

### Checks

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass, 0 errors, 17 warnings |
| Tests | **67 files, 878 passed, 3 opt-in skipped** (22 assistant tests, 4 order-lookup tests on real migrations) |
| `npm run build:offline` | Pass |
| Retrieval latency (Node, this machine, 2,000 mixed queries with a routine) | p50 0.058 ms, p95 0.084 ms; index build 0.34 ms; a 120,000-character input under 50 ms (bounded) |
| Bundle impact | `/assistant` 8.6 KB page, 129 KB first load. Routine finder +1 KB first load (165 to 166 KB). The panel is a lazy chunk of 18.8 KB raw, 7.1 KB gzip, loaded with the results. |
| Mutation checks | 7 of 7 caught, all restored:<br>- Diagnosis refusal removed: 1 failure.<br>- Unreviewed cautions stated: 6.<br>- Missing sources ignored: 1.<br>- Unapproved directions invented: 2.<br>- Ambiguity precedence lost: 1.<br>- Revoked routine explained: 1.<br>- No normalisation or bounds: 4. |

Tests cover:
- Synonyms ("vit b3", "nicotinamide", "HA", "SPF"); retinal kept distinct from retinol.
- Ambiguous ingredients, products and bare names, each with clarification options that settle it.
- Unsupported, empty and nonsense questions; diagnosis and medicine refusals.
- Approved versus missing directions; missing sources; education matching.
- Personal reasons for an included and an excluded product, a day and session schedule, no routine, revoked and outdated routines; general and personal answers kept distinct.
- Price as an action that states no price itself; an order question that ignores an order number and email typed into it.
- Markup, regex metacharacters and huge inputs.
- Order lookup: the right email finds the order with a coarse location only; a wrong email and a missing order give the same answer; a number alone is refused; guessing is rate limited.

Test-only knowledge (a direction, education answers, a reviewed caution) is labelled as such.

### Knowledge gaps that limit answers

- **Approved product directions:** none, so every "how do I use" answer is a limitation.
- **Approved education answers:** none, so general skincare questions (patch testing, layering, sun protection) are unsupported.
- **Reviewed ingredient cautions:** none, so ingredient answers give identity only.
- **Complete formulations:** none, so the assistant cannot say which products contain an ingredient. Highlights are marketing copy and are not used.
- **Reviewed concern and class wording:** the class phrases ("a humectant", "a retinoid") are dictionary categories, pending the clinician-reviewed nomenclature.

### Limitations

- **Not checked in a browser**, for the same reason as prompt 17 (no database access in this session).
- **No navigation entry:** `/assistant` is not linked from the header yet; the menu belongs to the Nuvē prompts.
- **English only.** Cue words and synonyms are fixed English lists; misspellings beyond the synonym table are not corrected.

## Prompt 19 — Live Nuvē desktop reference, measured and frozen (8 October 2026)

**Package:** `docs/redesign-reference/nuve-reference-2026-10-08.md`, with captures in `docs/redesign-reference/nuve-live-2026-10-08/w1280|w1440|w1920/`. The primary reference is the live site https://nuve-beauty.framer.website/; the lavender video is archived and Lovi is secondary. Only the public Community preview of the Lovi Figma file was seen; no editable layers are claimed.

### How it was captured

`scripts/capture-reference.mjs` (new, no dependencies) drives the local Edge 156 headless over the DevTools protocol. At 1280×800, 1440×900 and 1920×1080 (scale 1, scrollbars hidden) it records:
- The hero (closed), the CTA hover and the open menu.
- FAQ closed, first expanded and all clicked.
- The hero under reduced motion.
- A frame per viewport step down the page, and each section.
- `measurements.json`: computed typography, section boxes and padding, buttons, cards, images (rendered and source sizes, crop), colours, fonts, font files, the menu, the FAQ, hover, and animation states with and without `prefers-reduced-motion`.

The same script will capture the Avyora page for comparison in prompts 20–22.

### Measured values (headlines)

**Page and sections.**
- Page #FAFAFA; ink #1A1A1A; muted #696666; faint #ADADAD; cards #FFFFFF; lines #E8E8E8.
- 13 sections in a fixed order: header, hero, About, Results, Vision, Features, Services, Testimonials, Pricing, image break (sticky), FAQ, consultation CTA, footer.
- The hero, Vision and image break are 100vh. The other heights are constant across widths (Results 1608, Features 927, FAQ 944 and so on).

**Grid.**
- At 1280, content sits inside 40 px side padding.
- At 1440 and 1920, a centred 1240 px column.
- The hero copy, header and menu stay on a 40 px gutter at every width.

**Type does not scale with width.** Inter, mostly at −4 percent tracking:

| Role | Size / line height | Weight | Tracking |
| --- | --- | --- | --- |
| Hero headline | 100/100 | 500 | −6 px |
| Section heading | 80/88 | 500 | −3.2 px |
| Menu and statements | 40/52 | 500 | |
| Card title | 32/35.2 | | |
| About paragraph | 28/30.8 | | |
| Hero supporting copy | 20/26 | | |
| Eyebrow | 18/23.4 | | |
| Labels | 16/20.8 | | −0.64 px |

The wordmark is Instrument Serif 28/33.6 (48 px in the footer).

**Components.**
- Hero CTA 155×49 pill (radius 100, padding 14/24); consultation button 200×60, radius 40.
- Cards radius 18, inner panels 12, gaps 8 px.
- Results cards 616×585 at 1440 (596 at 1280; the spec's earlier 588 included a scrollbar).
- Process cards 408×194 (3×2); testimonial row 304/616/304×515; offer card 824×593.
- FAQ: one item open at a time.
- Menu overlay: white, five centred 40 px links 68 px apart, support details bottom-left, legal links bottom-right.
- Header 76 high, in flow (scrolls away), with a light sticky variant lower down.

**Motion.** Framer animates through its own runtime, so no Web Animations were readable and every timing is marked **proposed**. Observed states:
- Reveals start at opacity 0 and −20 px x.
- Word-split About paragraph.
- Text-roll button labels.
- Menu slides in.
- FAQ height expands.
- Sticky image break.

Under reduced motion the live site still hides unrevealed elements; Avyora must show final states instead.

### Assets

- **Fonts:** Inter and Instrument Serif are OFL. Avyora should self-host them from Google Fonts, not Framer's files.
- **Nuvē imagery (all of it):** template content with unknown licence and releases. **Unresolved: not usable.**
- **Avyora images today:** 36 Unsplash stock photos, not product packshots. **Unresolved: real campaign and product photography is needed** in the measured slots and ratios.
- **Icons:** redraw or use lucide.

### Comparison criteria

A section-by-section checklist (in the package, section 9) maps each reference section to its Avyora counterpart:
- Geometry anchors within 4 px.
- Identical headline line breaks.
- Exact type and colour tokens.
- Reveals as observed, with final states under reduced motion.

The necessary differences are recorded in section 10: identity, photography, real products and prices, working commerce, truthful content, accessibility, self-hosted fonts, and deferred mobile.

### Limitations

- **Unmeasured motion:** animation timings need a 60 fps screen recording to tune; card and link hovers and the sticky-header trigger point were not measured.
- **Scrollbars:** captures are without scrollbars; subtract 15 px when comparing against a browser that shows one.
- **Repository size:** the package adds 19 MB of images. Keep it out of the deployed build (it is under `docs/`) and consider Git LFS if the repository size matters.

## Prompt 20 — Desktop design primitives and storefront shell (8 October 2026)

**Rollout flag.** Everything is behind **`NEXT_PUBLIC_REDESIGN=1`** (`src/lib/redesign.ts`). Unset, the storefront is unchanged. The flag is build-time on purpose: a cookie or header switch would make every public page dynamic. To review, use a preview deployment with the variable set, or run `node scripts/dev-redesign.mjs` (the `dev-redesign` preview configuration), which also defines `DATABASE_URL` as empty so a review session cannot touch the production database.

### What was built

| File | Purpose |
| --- | --- |
| `src/app/globals.css` | `--nv-*` tokens:<br>- Colours (#FAFAFA, #1A1A1A, #696666, #ADADAD, #FFFFFF, #E8E8E8; glass; plus a danger colour not in the reference).<br>- 40 px gutter, 1240 px container, 8 px gap, radii 18/12/100, 76 px header.<br>- Motion timings, marked proposed.<br>Also `.nv-focus` and `.nv-focus-light` (2 px outline, 4 px offset, keyboard focus only), a CSS-only scroll reveal (`.nv-reveal`: view timelines, final state under reduced motion or without support), `.nv-motion` (no animation under reduced motion), and Inter for headings under the redesign. |
| `tailwind.config.ts` | `nv` colours, `font-nv` (Inter) and `font-wordmark` (Instrument Serif), the measured type scale (`text-nv-hero` 100/100 −6 … `text-nv-small` 14/19.6), radii, container, gutter, timing tokens. |
| `src/app/layout.tsx` | Inter 400/500 and Instrument Serif 400 through `next/font`: self-hosted, `display: swap`, metric-matched fallbacks, not preloaded (font options must be literals, so preload cannot follow the flag). The redesign body classes and the server-rendered footer are passed into the shell. |
| `src/lib/utils.ts` | tailwind-merge taught the custom font sizes. Without it, `cn()` dropped `text-white` beside `text-nv-label`, and dark buttons lost their labels. A regression test is in `src/lib/__tests__/cn.test.ts`. |
| `src/components/nv/primitives.tsx` (server) | Container (40 px gutters, centred 1240 column), Bleed, Section (100/150/200 rhythm), Grid (8 px gaps), Heading (level and size separate), Muted second tone, Eyebrow, Text, Wordmark, Button (dark/light/outline/ghost; 49 px pill or 60 px radius-40; loading and disabled; `asChild`), ArrowLink, Card (radius 18, 32 px inset), StatusMessage (`role=status`, `role=alert` for errors), Spinner (always labelled), Skeleton (fixed size), Reveal. |
| `src/components/nv/field.tsx` (server) | TextField and TextAreaField with label, hint and error linked through `aria-describedby`, and `aria-invalid`. |
| `src/components/nv/accordion.tsx` (client) | The reference FAQ: one item open at a time, real buttons with `aria-expanded` and `aria-controls`, labelled regions, ink + and − toggles. |
| `src/components/nv/dialog.tsx` (client) | Radix dialog: focus trapped and returned, Escape, background hidden from assistive technology. |
| `src/components/nv/nv-image.tsx` (client) | `next/image` in a fixed aspect-ratio slot. Never hidden by script; on failure the slot keeps its size and shows the alt text; cover crop with a focal point. |
| `src/components/nv/shell/` | `site-header.tsx` (client): 76 px, wordmark on the 40 px gutter, account, wishlist and bag controls with counts, plus the menu button. `MenuOverlay`: white panel, 40/52 centred links, support bottom-left, legal bottom-right, slide-in (none under reduced motion). `site-footer.tsx` (server): 48 px wordmark, three link columns at a 38 px pitch, the delivery line. `nav.ts`: one list of real routes. |
| `src/components/layout/client-layout-wrapper.tsx` | With the flag on: skip link, new header, `<main id="main">`, server footer, the existing cart drawer and toaster. Sign-in pages and staff consoles keep their bare layout. Cart, wishlist, auth and sync providers are unchanged. |
| `src/app/design-system/` | Review page (noindex, unlinked) showing every primitive and state. Demo copy is isolated in `fixtures.ts`, labelled DEMO; product cards use the real catalogue. |
| `scripts/capture-reference.mjs` | Now also handles menu buttons named only by `aria-label`, so it can capture Avyora pages for comparison. |

### Caching and data

- **No session in the shell.** The header never fetches the session: account is a link, and `/account` sends signed-out visitors to sign in. Cart and wishlist counts come from the existing store. Public pages stay static; the footer is a server component and ships no JavaScript.
- **Real data contracts.** Product cards use `PRODUCTS`; the support email and delivery line come from `business-info` and `money` (the email is still on the launch-blocker list); navigation lists only existing routes.

### Verification

Checked on the `/design-system` review page in the in-app browser and with headless captures at all three widths:

| Check | Result |
| --- | --- |
| Geometry at 1280 / 1440 / 1920 | Content starts at x = 40 / 100 / 340, matching the reference exactly. Results cards 596×566 / 616×585 / 616×585. Header 76 px; wordmark Instrument Serif 28 px at x = 40. |
| Typography | Headings Inter 80/88 −3.2, 500 (after fixing the base rule that set them in Foglihten) |
| Layout shift | 0 on load with fonts swapping |
| Image failure | A missing image keeps its 408×194 slot and shows its alt text (the optimiser returned 404 and the error state rendered) |
| Long content | A long card title and a long FAQ question wrap without breaking alignment |
| Keyboard | Tab order skip link → wordmark → account → wishlist → bag → menu, each with a visible 2 px outline. Enter opens the menu with focus on Close and the page hidden from assistive technology; Escape closes it and returns focus to Menu. The accordion opens one item at a time. |
| 200 percent zoom (720 px viewport) | Header controls fit and stay reachable. The review page's fixed desktop grids and the footer columns need horizontal scrolling (about 1066 px); nothing is clipped. Reflow at that width belongs with the deferred narrow layouts. |
| Typecheck | Pass |
| Lint | 0 errors, 17 warnings |
| Tests | 68 files, 880 passed, 3 opt-in skipped |
| Builds | `build:offline` passes with the flag off and on; home stays static (○) at 136 KB first load either way; shared JS 103 KB |

Two defects were found and fixed during verification:
- Every control showed a permanent outline (the colour override defeated `outline-none`).
- Dark buttons lost their label colour (tailwind-merge).

### Intentional differences from the reference

1. Avyora wordmark ("Avyora" in Instrument Serif), not Nuvē.
2. Compact account, wishlist and bag controls beside the menu button (the reference has none; a shop needs them).
3. Menu links point to real routes (Shop, Routine finder, Ask Avyora, Journal, Track order); "Careers" is dropped.
4. The footer sits on the ink colour until approved photography exists. Its columns are Shop, Your account and Policies, plus the delivery line from the removed announcement bar.
5. A skip link, and final states under reduced motion (the reference hides unrevealed content even then).
6. A danger colour for errors, which the reference does not have.
7. Fonts are not preloaded while the flag exists.
8. The light-on-photo header (`tone="light"`) exists but no page uses it yet; the home hero is prompt 21. The reference's sticky light header (trigger point unmeasured) is not built.

### Limitations

- **Old pages under the flag.** Existing pages still use the old components inside the new shell; only headings switch to Inter. The section rebuilds are prompts 21–22.
- **Wrong-brand photo.** The catalogue's stock photo for Centella Cleansing Balm shows another brand's label (Unsplash image of a "NEAUTHY" jar). Replace it before launch, along with the other stock imagery (prompt 19 asset list).
- **Zoom reflow.** Reflow below desktop widths is deferred with mobile and tablet.

## Prompt 21 — Desktop hero and navigation overlay (8 October 2026)

Behind `NEXT_PUBLIC_REDESIGN=1`, like prompt 20. With the flag off, the home page is unchanged.

### What was built

| File | Purpose |
| --- | --- |
| `src/components/nv/home/hero.tsx` (server, no JavaScript) | The reference composition:<br>- 100vh full-bleed section.<br>- Supporting copy (20/26, 310 px box, top 120 px, right edge on the 40 px gutter).<br>- White 49 px pill CTA 24 px below the copy.<br>- Uppercase eyebrow (18/23.4, 210 px, top at 50% − 20 px).<br>- Two-line 100/100 −6 px headline (≤ 900 px, bottom 40 px above the fold).<br>Copy is true to the product: "Skincare built around a simple routine"; "Answer a few questions and get a weekly routine that fits your skin and your budget"; eyebrow "Cleanse, treat, moisturise and protect"; CTA **Find your routine → /routine-finder**. The entrance (text rises 16 px and fades in, 700 ms; image settles from scale 1.05) is proposed timing and is skipped under reduced motion. |
| `src/components/nv/shell/site-header.tsx` | On `/` the header lies over the hero in white. A **Shop** text link sits beside the account, wishlist and bag controls. Header padding is 20/22 so the wordmark box starts at y = 20 and the menu button centres on y = 37, as measured. |
| Menu overlay (same file, narrow client component) | White panel, **675 px tall at every width** (measured); links top-aligned, first line box at y = 154 (reference 153), 68 px pitch, Inter 40/52; support email bottom-left. Account, Wishlist (count) and Bag (count; opens the cart drawer) bottom-right. Close (×) in place of the menu button. Slides down in 500 ms and up in 350 ms (proposed); no animation under reduced motion. |
| Scroll lock | Radix's lock did not stop wheel scrolling under the panel (measured 600 px). The overlay now locks the root while open, with scrollbar padding so nothing shifts sideways. Verified headless: wheel over the panel and over the page below it does not scroll; after Escape the root is restored and scrolling works. |
| `src/app/page.tsx`, `home-client.tsx` | With the flag on, the server hero renders first and the old carousel is skipped. The old component renders a `<div>`, not a second `<main>`, inside the layout. |
| `scripts/capture-reference.mjs` | Now also records menu behaviour: whether the page scrolls while open, whether Escape closes it, and where focus lands. |
| `scripts/compare-captures.py` (new) | Side-by-side images (reference left, Avyora right) and a table of hero anchor differences from two capture folders. |

### Visual checks (side by side with the frozen reference)

Images are in `docs/redesign-reference/comparisons/2026-10-08-hero-menu/` (hero closed, menu open, reduced motion; 1280, 1440, 1920). The anchor table is in `2026-10-08-hero-menu.anchors.md`.

| Anchor (1280 / 1440 / 1920) | Reference | Avyora | Difference |
| --- | --- | --- | --- |
| Headline | x 40; y 560 / 660 / 840; 900×200 (two lines) | same | **0, 0** at every width |
| Supporting copy (right edge, top) | 1240 / 1400 / 1880, 120; 310×78 | same | **0, 0** |
| Eyebrow | 40; 380 / 430 / 520; 210×70 | same | **0, 0** |
| Wordmark | 40, 20 (34 high) | 40, 20 (34 high); wider for "Avyora" | **0, 0** |
| CTA (right edge, top) | 1240 / 1400 / 1880, 222; 155×49 | same right edge and top; 167×49 | **0, 0** (12 px wider for the label) |
| Menu panel | 675 px tall; first link line box y 153; 68 px pitch | 675; y 154; 68 | **+1 px** on the links |

Fixed during comparison:
- The wordmark sat at y = 21: header padding changed to 20/22.
- The overlay was 84vh with centred links: now a fixed 675 px with top-aligned links.
- The third-party-branded placeholder photograph was removed.

### Functional checks

| Check | Result |
| --- | --- |
| Keyboard | Enter on Menu opens the overlay with focus on Close. Twelve Tabs stay inside the overlay (trapped). Escape closes it and focus returns to Menu. Background is hidden from assistive technology. |
| Scroll lock | As above: locked while open, restored on close |
| Routes | CTA → `/routine-finder`; header Shop → `/collections` (200); Account → `/account` (307 to sign-in when signed out, authentication unchanged); Wishlist → `/wishlist`; Bag opens the existing cart drawer with the existing counts. |
| Loading | No layout shift on load (CLS 0). The hero is a server component with no image today (see below). When an image is set it loads with `priority`, `fetchPriority="high"` and `sizes="100vw"`; text sits on an ink surface if it fails. |
| Caching | The hero and footer are server components; only the header and overlay are client code. Home stays static. |
| Typecheck | Pass |
| Lint | 0 errors, 17 warnings |
| Tests | 68 files, 880 passed, 3 opt-in skipped |
| Builds | `build:offline` passes with the flag off and on; home stays static |

### Intentional differences

1. **Photograph.** None. No approved Avyora image exists, and the storefront's stock still lifes carry other brands' labels (the hero candidate showed "MENDER" products), so the hero uses a neutral ink surface until a photograph is supplied (`HERO_IMAGE` in `hero.tsx`, with the slot specification). A scrim for white text is applied only when an image is present.
2. **Copy and CTA.** Avyora's own copy; the CTA is 167 px wide for its longer label, right edge matched.
3. **Header.** A Shop link and account, wishlist and bag controls beside the menu button.
4. **Overlay.** Avyora's five routes instead of Home, Results, About, Careers and Contact. Account, Wishlist and Bag replace the reference's legal links in the lower right (legal links are in the footer).
5. **Close control.** A plain × (lucide) rather than the reference's drawn icon.
6. **Motion.** Timings are proposals tuned by eye; none could be measured from the reference's runtime.

### Remaining gaps

- **Hero photograph.** An approved hero photograph is needed. The composition is ready and verified without one.
- **Wrong-brand imagery on the live site.** With the flag **off**, the current home carousel still shows the same third-party-branded still life; the catalogue's product photos also include another brand's jar (prompt 20). These need replacing whatever happens to the redesign.
- **Rest of the landing page.** Below the hero, the home page is still the old sections inside the new shell (prompt 22).
- **Motion.** Not compared frame by frame; a 60 fps recording of the reference is needed.
- **Sticky header.** The light sticky header variant is not built.

## Prompt 22 — Desktop landing page (9 October 2026)

Behind `NEXT_PUBLIC_REDESIGN=1`; with the flag off the home page is unchanged.

**What was built:**
- **Sections** (`src/components/nv/home/landing.tsx`, server components): About, Results, Vision, Features, Services, Testimonials, Pricing, Image break (sticky), FAQ and Consultation, after the prompt 21 hero, in the reference order, with the shell's footer.
- **Client code** is limited to three islands:
  - `quick-add.tsx`: size choice and add to bag. "In bag" is read from the bag; sold-out sizes cannot be added.
  - The FAQ accordion.
  - `support-form.tsx`.

**Content mapping (true today):**

| Section | Avyora content |
| --- | --- |
| About | Avyora's routine approach, with a "7 days" card (the routine finder plans seven days) instead of the reference's unverified "98 %". |
| Results | "Best sellers": four real products with current display prices, size choice, counted stock and add to bag. Products whose stock photo shows another brand's label are excluded. |
| Features | Six numbered cards describing what exists: questionnaire, weekly routine, ingredient checks, budget and owned products, Ask Avyora, saved routines (with the real retention periods). No scan card, because there is no scan. |
| Services | Rows linking to the shop, routine finder, assistant and journal. |
| Testimonials | Shows one **published** review (verified purchases first) if any exists. Otherwise it shows labelled product education. No review is invented. |
| Pricing | Replaces the reference's $29/month subscription with "The three essentials": the lowest current in-stock price per essential step from real SKUs, the total, and a "Build my routine" CTA. No offer is invented. |
| FAQ | Routine building, scan (not available), saving and retention, delivery (`DELIVERY_TERMS`), returns (links to the policy) and medical advice. |
| Consultation | A real support form. |

**Support form backend.**
- **Endpoint:** `POST /api/support`. Same-origin only, a 4 KB body cap, strict validation and explicit contact consent. It is rate limited to 3 an hour per email and 10 per IP.
- **Storage:** requests are saved to the new `support_requests` table (**migration 0020**) and the customer gets a reference number. No response time is promised, because none is confirmed.
- **Staff:** requests appear in admin → Requests.

**Old home content.**
- The product grid, categories and concerns are on `/collections`, with the same filters.
- The "Build your routine" panel became the Pricing section.

**Photography.** No approved photographs exist, so the About, Vision, Services, Testimonials, Image break and Consultation slots are neutral surfaces (`PHOTO_SLOTS` in `landing.tsx`, sized as measured).

**Comparison** (`docs/redesign-reference/comparisons/2026-10-09-landing/`, full page and hero at 1280, 1440 and 1920). After fixes, section heights at 1440 match the reference:

| Section | Avyora vs reference (px) |
| --- | --- |
| Hero, Results, Vision, Services, Testimonials, Image break | 0 |
| About (762), FAQ (944), Footer (530) | 0 |
| Features, Pricing | −1 |
| Consultation | +4 |
| **Page** | 11,403 vs 11,400 |

Fixes made during the comparison:
- About was 6 px taller (column layout).
- FAQ rows were 4 px taller.
- The footer was 71 px shorter.
- Services used pill buttons where the reference has rows.

**Checks:** typecheck and lint clean. Support route: 5 tests (valid request, consent required, unknown fields, foreign origin, oversized body, rate limit, concurrent staff answer).

## Prompt 23 — Shopping and checkout redesign (9 October 2026)

**Theme.** Under the flag, `body.nv-theme` maps the existing component tokens onto the measured palette, Inter type and 18 px radius. It is placed on `<body>` so portalled drawers and dialogs are included. Shared containers use the 1240 px column with 40 px gutters; the gold ornaments are hidden and eyebrows are neutral. The result: collections, product, wishlist, bag drawer, checkout, order confirmation and account pages take the design system **without any change to their logic**. Search, filters, sorting, galleries, variant selection, quantity, ingredients, directions, related products and sync are untouched.

**Captured at 1440:** collections, product page, checkout (empty bag) and wishlist; `/account/routines` redirects to sign-in, as intended.

**Content fix (both flag states).** The collections intro claimed "research-backed formulations, each synthesised in-house … full ingredient transparency"; nothing substantiates it, so it now reads "Every product in the range, with current prices and stock."

**Commerce correctness (preserved, not re-implemented).** Covered by the existing suite:
- integer-paise pricing, and displayed price matching the charge
- server-side checkout quote
- Razorpay signature verification and the webhook
- order idempotency
- stock reservation and restoration
- COD risk rules
- order and invoice access tokens

**Not verified:**
- **Live sandbox payment:** no Razorpay test keys are configured in this environment.
- **Browser checkout with stock:** the review server runs without a database, so every SKU shows as out of stock.

**Wrong-brand photo.** The catalogue's stock photo `photo-1601049541289-9b1b7bbbfe19` (used for Centella Cleansing Balm, 5x Essential Ceramide Cream and Water-Gel Sorbet Moisturizer) shows another brand's label ("NEAUTHY"). It is excluded from the landing page, but the product pages still show it until approved photography replaces it.

## Prompt 24 — Accounts, orders, routines and support (9 October 2026)

**Existing functionality, preserved:**
- sign-in by Google, email and phone, with the return path (`callbackUrl`)
- account hub, address book (create, edit, delete, default), orders, order detail and invoice, track order, data page
- policies, journal and contact
- sign-out clearing of private client state (prompt 12)

**New: `/account/routines`.**
- **Listing:** every saved routine with its true state:
  - up to date, guidance updated, or no longer valid (release revoked)
  - **expired** or **permission withdrawn**: shown with an explanation, never silently missing, and never openable
- **Actions:** open through the verified routine API, delete with a confirmation step, and withdraw routine-saving permission with a confirmation step.
- **Access:** server-rendered for the signed-in account only, never cached; it redirects to sign-in with a return path. The account hub tile now links here.
- **New query:** `routineHistory` in `modules/personal/routines.ts`.

**Tests:**
- Routine history states: current → expired → consent withdrawn, and another account's history is empty.
- Address CRUD ownership (`addresses-ownership.integration.test.ts`): another account cannot read, change, set a default on, or delete an address.

Existing tests still cover order and invoice access tokens, saved-routine reload and foreign routine ids.

**Not built:** a self-service order cancellation or refund request. No approved customer-side rule exists, so cancellation stays staff-side (`cancelOrder` in the admin).

## Prompt 25 — Staff, CMS and knowledge operations (9 October 2026)

**Knowledge, `/admin/knowledge`** (new; `modules/knowledge/admin.ts`). Authoring stays in the repository as reviewed data, so every change is a reviewable diff. The page:
- validates the repository knowledge, listing each blocking problem by record id, plus the records awaiting review
- lists every stored release with its status, active and previous pointers, and who stored it
- offers **owner-only** actions: publish (type PUBLISH to confirm), roll back (reason required) and revoke (reason required; the active release cannot be revoked)

Managers can read but not act. Actions are rate limited (`staffPublish`) and audited through the release module, which locks the active-pointer row so concurrent activations cannot interleave.

**Support messages** in admin → Requests (`modules/support/support.ts`). "Mark answered" is conditional on the request still being open, so two staff answering at once cannot both record it. It is audited (`support.answered`).

**Existing workflows unchanged:** inventory, pricing (owner-only), analytics, restock, packing and dispatch, CMS revisions and media, system.

**Tests:**
- Knowledge (5): validation; a manager is refused; owner publish is idempotent and audited; an invalid record blocks publication and is named; rollback needs a reason; the active release cannot be revoked; revoke after rollback.
- Support (5).

**Not built:** scan-job views. Only database tables exist for scans (prompt 26 builds sessions; there is no worker).

## Prompt 26 — Optional desktop capture and private scan sessions (9 October 2026)

**Off by default.** Two reversible flags:
- `NEXT_PUBLIC_FACE_SCAN=1` shows `/scan` and the routine finder's entry to it. On its own, photos are checked in the browser and never sent.
- `FACE_SCAN_HOSTED=1` additionally allows uploads. It also needs `PRIVATE_STORAGE` and a database. Without the flags, `/scan` is a 404 and `/api/scans*` returns 503 `scan_disabled`.

**No analysis.** No evaluated model exists, so every path ends in "Analysis unavailable" and the questionnaire. No score, label or skin observation is produced or invented. The inference stage is prompt 27.

**Customer flow (`src/app/scan/`, desktop):**
1. Cosmetic-only scope, with the questionnaire offered as the full alternative.
2. A separate photo consent (not bundled with routine saving), stating what happens to the photo in the current mode.
3. Webcam or file upload.
4. Local checks: type, 5 MB, decoded size (480 px short side, 12 MP), brightness and contrast, and the face count where the browser has `FaceDetector`. With no detector, the count is "unknown", not assumed.
5. Review, retake, then send privately (hosted) or discard (local).

Camera tracks are stopped on capture and on leaving the page; object URLs are revoked whenever a photo is replaced or dropped.

**Error states:**

| State | Message |
| --- | --- |
| Camera blocked, missing or busy | Each has its own message and points to upload instead |
| Unsupported file | Unsupported type or over 5 MB |
| Invalid image | Undecodable, too small, or more than 12 MP |
| Expired, withdrawn or foreign session | A single "no longer available" message (404) |
| Upload refused | Sign in required, consent required, quota reached |

**Camera permission.** `Permissions-Policy: camera=(self)` is sent only for `/scan` and its sub-paths; every other route keeps `camera=()`. Verified on the review server.

**Server (`src/modules/scans/`):**
- `image-validation.ts`: checks shared by the browser and the server; the type is sniffed from the bytes.
- `reencode.ts`: sharp with `limitInputPixels` (stops decompression bombs), applies orientation, then re-encodes to JPEG, which drops all EXIF, GPS, ICC and XMP metadata.
- `private-storage.ts`: storage adapter.
  - `PRIVATE_STORAGE=local`: a git-ignored `.private-storage/` folder, for development only.
  - Keys are server-shaped (`private/scans/<uuid>.jpg`); any other key is refused.
  - HMAC read tokens are capped at 10 minutes.
  - No hosted storage is configured, so hosted upload stays off in production.
- `sessions.ts`: create, upload, get, delete and `purgeOwnerScans`. Every call re-checks owner, expiry and live consent.
  - Create goes through the durable admission quotas (3 a day and 10 per 30 days per owner, 20 a day per IP, 100 a day overall).
  - Upload is allowed once, only from `created`.
  - Photos expire after 24 hours (DB CHECK).
  - If consent is withdrawn mid-upload, the stored object is deleted.
- Routes (all same-origin, `scanStatus`-limited, signed-in accounts only, private no-store):
  - `POST /api/scans`
  - `POST /api/scans/[id]/upload` (raw bytes, bounded to 5 MB while streaming)
  - `GET` and `DELETE /api/scans/[id]` (status only, never the image or key; delete is always 204)
- `/api/consent` now accepts `photo_processing`, for signed-in accounts and only while hosted scans are on. `DELETE ?purpose=photo_processing` withdraws it: the database trigger revokes the scans, then `purgeOwnerScans` deletes the stored photos. A storage failure leaves the key for the sweep (prompt 28) to retry.

**Checks:**
- Typecheck and lint are clean.
- Tests: image pipeline 8, sessions 7, admission (existing), security 19 (camera policy); 41 pass.
- Session tests cover:
  - consent required
  - single upload with status that never exposes the key
  - foreign and expired sessions unavailable
  - an invalid image keeps nothing
  - no storage configured
  - withdrawal plus purge deletes the photo
  - owner deletion
- Browser (review server, local mode):
  - unsupported SVG
  - a too-small JPEG
  - a valid photo reaching review
  - the honest finish state, with no blob URL left
  - the camera blocked by the pane, which shows the denied message

**Fixed while verifying.** After a reload, the browser restored the ticked consent box while React state was unticked, so Continue stayed disabled. The checkbox now opts out of form restoration.

**Not done or dependent:**
- Hosted private storage (bucket, credentials, lifecycle rule) is an owner decision.
- A real webcam capture was not exercised: the review pane blocks cameras.
- Hosted upload was exercised only in the integration tests, not in a browser, because the review server has no database.

## Prompt 27 — Image inference lifecycle, disabled pending a model (9 October 2026)

**State: disabled. No model is configured.** `configuredSkinAnalyzer()` returns null, so nothing is ever queued. Every upload reports `analysis: 'unavailable'`, the UI says so, and no score of any kind is produced: no random, placeholder or demo values.

**What a model needs before it may be switched on** (documented in `src/modules/ai/skin-analysis.ts`):
1. A licence that permits commercial hosted use.
2. Evaluation on a held-out, person-level split for each appearance task it reports, with calibrated likelihoods added to the knowledge base (spec §§12–13), not raw confidence.
3. A pinned model version.

Plugging one in means implementing `SkinImageAnalyzer`: `modelVersion` plus `analyze(bytes, signal)` returning raw output.

**Lifecycle (spec §19), built on the existing Postgres job queue** (`FOR UPDATE SKIP LOCKED`, leases, fenced completion, backoff, dead letters):

| Control | Implementation |
| --- | --- |
| Admission | `requestScanInference`: only `uploaded` → `queued`, owner and expiry checked, one job per scan (dedupe `scan:<id>`), enqueued in the same transaction as the status change |
| Backlog | At most 50 pending scans; then refused with `busy`, and the quiz stays available |
| Spend | Durable admission quotas (prompt 26), plus `recordBillableAttempt` before every provider call: at most 2 per scan (DB CHECK) |
| Timeouts | 15 s per attempt, enforced with `AbortController`; the provider sees the abort. 60 s total per scan. The queue lease is 60 s |
| Retry | A transient failure returns the scan to `queued` and the queue retries once; the last attempt fails the scan |
| Consent | Re-checked before inference (join on live consent), on every status change (DB trigger), and at completion (atomic `processing` → `completed`). Withdrawn mid-inference: result discarded, photo deleted |
| Output | Untrusted. Must parse as bounded `ObservationV1` (`scanResultSchema`) from the same model version; anything else is discarded and the scan fails. The quiz-only routine is unaffected |
| Photo | Deleted when the scan completes or fails. The object key is cleared only after the delete succeeds, so a failed delete stays visible to the retention sweep |
| Safety | Vision observations enter the routine engine only as accepted evidence and cannot relax hard exclusions (prompt 13 engine, unchanged) |

Failed and dead jobs appear with every other job in admin → System.

**Tests (`modules/ai/__tests__/scan-inference.integration.test.ts`, 8):**
- no model, nothing queued
- a stray job without a model fails the scan and deletes the photo
- with a test model:
  - queue once, store validated observations, delete the photo
  - random or wrong-version output discarded
  - transient failure retried once, then capped at 2 calls
  - a hung model timed out and aborted
  - consent withdrawn before and during inference
  - backlog full

The old seam tests in `background-jobs.integration.test.ts` were replaced by these. Typecheck and lint are clean.

**Dependencies:**
- **Owner:** model selection, licence and an evaluation dataset with appropriate consent.
- **Engineering, once a model exists:**
  - a worker cadence for interactive scans (the daily cron is not one)
  - result polling in `/scan`
  - passing the scan id to `POST /api/routines` (already accepted and verified server-side by `scanObservations`)

## Prompt 28 — Feedback, privacy lifecycle and observability (9 October 2026)

**Weekly feedback (`/account/routines`).** Each openable saved routine has a "How is week N going?" form with three bounded choices: adherence, tolerability and change. It posts to the existing `POST /api/routines/[id]/feedback` (accounts only, rate limited, once per week, tied to the routine's knowledge release). The server computes the week. The form includes a plain "stop and seek advice if irritated" line. Feedback informs follow-up only; it never changes a routine on its own and is not a training label.

**Consent withdrawal.**

| Permission | On withdrawal |
| --- | --- |
| Routine saving | Unchanged from prompt 24: saved routines stop being shown |
| Photo processing | DB trigger revokes scans and suppresses results; `purgeOwnerScans` deletes stored photos at once; a failed delete is left for the sweep |

The account page now shows the photo permission with its own withdraw button; `WithdrawSaving` takes a `purpose`.

**Expiry and deletion (`/api/cron/sweep`, CRON_SECRET-protected, retryable, batched):**
- Existing: abandoned reservations, idempotency keys, rate-limit rows, expired routines and profiles.
- New, `sweepScans`:
  1. Deletes photos past their 24 hours, or whose scan has ended. The key is cleared only after storage confirms, so a failed delete is retried on the next run.
  2. Deletes scan rows past their 7-day expiry once no photo remains. Admission rows stay, so quotas still count.

**Retention: implemented vs proposed.**

| Data | Retention | Status |
| --- | --- | --- |
| Guest routine | 30 days | Implemented |
| Account routine | 180 days | Implemented |
| Scan photo | ≤ 24 h, deleted on completion or failure | Implemented (DB CHECK and sweep) |
| Scan observations | ≤ 7 days | Implemented |
| Support requests | 12 months after closing | **Proposed, not implemented**; owner to confirm |
| Routine feedback | Deleted with its routine | Implemented (cascade) |
| Consent records | Kept as the audit of permissions | Append-only; period for owner and legal review |

**Telemetry redaction (`lib/observability.ts`).**
- Every log and error report already went through `redact`.
- **Newly masked keys:** questionnaire answers, profiles, photos, images, object keys, observations, owner hashes, IP addresses and signed URLs.
- **Free text** (error messages, URLs) is now scrubbed of email addresses, Indian mobile numbers and private object keys.
- **Tested:** 10 observability tests.

**Monitoring.** Admin → System now shows pending scans, failed scans in 24 h, and **photos past their deletion time** (highlighted when non-zero, the deletion-backlog alert spec §7 asks for). Existing queue depth, dead jobs and dead deliveries are unchanged.

**Checks:**
- Typecheck and lint clean.
- Scans, personal and observability suites: 179 tests, plus the sweep test (overdue photo, failed delete retried, expired row dropped, admission kept).

**Not done:**
- An external alert channel. Sentry is optional and not configured here; the backlog is visible in admin only.
- Support-request retention, until the owner sets a period.

## Prompt 29 — Promotions, loyalty, reviews and newsletter (9 October 2026)

**Promotions: only what is supported.**
- **Existing offers:** the only offer in the system is a per-SKU sale price with an optional label and start and end times (`product_pricing`, owner-only in admin → Pricing, versioned). Display price equals the charge and is enforced server-side (prompt 2). Nothing changed.
- **No coupons, codes, bundles, free gifts or loyalty points:** none have defined rules, so none were built. `lib/content-claims.ts` already blocks loyalty and reward-points wording in content.
- **To add one, the owner must define:**
  - eligibility
  - stacking with sale prices
  - caps per customer
  - expiry
  - behaviour on refund or return
- **Loyalty also needs a ledger:** an append-only transaction table, with reversal on refund.

**Reviews: verified purchases, moderated (`modules/reviews/reviews.ts`).**
- **Who can review:** only an account with a **delivered** order containing the product. The review is linked to that order. One per customer per product (existing unique index).
- **Moderation:** submissions are stored unpublished. Staff publish, or reject (which deletes the review so the customer may write again), in admin → Requests → "Reviews to moderate". Both are audited (`review.publish` / `review.reject`). The moderation view shows the text only, no reviewer contact details.
- **Product page:**
  - The rating and count come only from published reviews. The catalogue file carries no ratings.
  - JSON-LD `aggregateRating` appears only when published reviews exist.
  - Reviews are labelled "Verified purchase".
  - The "Write a review" form explains who may review. The server refuses anyone else with a plain message.
- **API:** `POST /api/reviews`: same-origin, signed-in, rate limited (`review`: 5 an hour per account, 20 per IP), 4 KB body, strict schema (rating 1–5, body 20–2000 characters). A client cannot set an order id.

**Newsletter: double opt-in (`modules/newsletter/newsletter.ts`, migration 0021, flagged off).**
- **Flags:**
  - `NEXT_PUBLIC_NEWSLETTER=1` shows the footer form, with an explicit, unticked consent box.
  - `NEWSLETTER_ENABLED=1` plus configured email delivery (Resend) opens `POST /api/newsletter`.
- **Sign-up:**
  - It stores `pending` with a SHA-256 token hash and the consent wording version, then emails a link.
  - The answer is identical whatever the address's state, so subscriptions cannot be enumerated.
  - A repeat sign-up rotates the token and never downgrades a confirmed subscriber.
- **Confirm and unsubscribe:**
  - `/newsletter?token=` shows buttons. The change happens on a button press, so mail scanners following links cannot confirm or unsubscribe.
  - Unsubscribe works from any state. The unsubscribed address is kept only as a do-not-send record.
- **Retention:** unconfirmed sign-ups expire after 7 days and are deleted by the cron sweep.
- **Logging:** tokens in URLs are redacted (`token=[redacted]`).
- **Sending:** there is no newsletter sending tool. Subscribers are a list for the owner's chosen service, which must honour unsubscribes.

**Checks:**
- Typecheck and lint clean (one existing unused-argument warning in the product page).
- Reviews: 4 tests (verification: none, shipped, wrong product, delivered; one per product; publication gating and aggregate; reject and rewrite; input bounds).
- Newsletter: 4 tests (pending to confirmed with hash-only storage; token rotation and no downgrade; unsubscribe and re-opt-in; 7-day expiry).
- Redaction: 10 tests.

**Migration 0021** (`newsletter_subscribers`, additive) has been run only in the PGlite test databases, not against any shared database. **It needs owner approval before production**, as does 0020.

## Prompt 30 — Desktop acceptance, performance and handoff (9 October 2026)

**Handoff:** [`docs/handoff-2026-10-09.md`](handoff-2026-10-09.md). It covers:
- how to review the build
- every flag
- what is implemented, verified, disabled and pending
- owner decisions before release
- rollback
- completion matrices for the 30 prompts and the audit

**Reviewable build:**
- `NEXT_PUBLIC_REDESIGN=1 NEXT_PUBLIC_FACE_SCAN=1 npm run build:offline` passes.
- Serve it with `node scripts/dev-redesign.mjs --start 9004` (launch entry `start-redesign`).
- Not deployed.

**Acceptance pass.** New `scripts/acceptance-pass.mjs` (CDP, headless Edge) loads 10 pages at 1280, 1440 and 1920. For each it saves a screenshot and records:
- TTFB, FCP, LCP, CLS and bytes
- horizontal overflow
- accessibility checks: `lang`, one `h1`, heading order, image alt text, named buttons and links, labelled fields

Results are in `docs/redesign-reference/acceptance/2026-10-09/` (30 screenshots and `measurements.json`). Final run: no accessibility findings, no overflow, CLS 0. Visual fidelity against the Nuvē reference is the prompt 22 comparison (`comparisons/2026-10-09-landing/`, three widths).

**Caching** (`scripts/measure-pages.mjs`, from prompt 11): public pages are served from the cache (HIT); every private path returns `private, no-store, max-age=0`. That includes the new `/scan`, `/api/scans`, `/newsletter`, `/api/newsletter`, `/api/reviews`, `/api/support` and `/account/routines`.

**Fixed during the pass:**
- `/login` had no `h1` (the card title was a `div`).
- `/collections` and product pages skipped from `h1` to `h3`; a visually hidden `h2` now introduces the product grid and the details accordion.
- The new `/scan`, `/newsletter` and product review section were left-aligned at 1920 (added `mx-auto`).
- The measuring script itself: blank page between loads, focus emulation, and a screenshot retry, because headless Edge stops painting unfocused tabs.

**Performance and bundles.** Medians and two-run ranges are in the handoff §4. Local and unthrottled: TTFB is roughly 5–40 ms by `curl`. Bundle sizes:

| Bundle | Size |
| --- | --- |
| Shared first-load JS | 103 kB |
| Home | 139 kB |
| Product | 142 kB |
| Routine finder | 167 kB |
| `/scan` | 119 kB |

**Checks:**
- Typecheck clean.
- Lint 0 errors.
- Build passes.
- Full suite: 911 passed, 3 skipped. Two files failed at module import under full parallel load and pass alone (14/14); the earlier run had a different file fail the same way. Details in the handoff §4.1.

**Not verified in a browser** (no database, no payment test keys):
- checkout with stock
- Razorpay sandbox
- sign-in merge
- saved-routine reload
- assistant with a published release
- reviews, newsletter and hosted upload

Each is covered by integration tests.

## Remaining sequence

| # | Prompt | Status |
| --- | --- | --- |
| 1 | Build baseline and implementation tracking | **Done** |
| 2 | Cart variant, quantity and price correctness | **Done** |
| 3 | Immediate routine safety and simplicity fixes | **Done** |
| 4 | Honest claims, offers and business content | **Done** |
| 5 | Normalized catalogue and SKU migration | **Done** (migration 0014 not yet applied to production) |
| 6 | Canonical ingredients, formulations and directions | **Done** (migration 0015 not yet applied to production) |
| 7 | Shared typed recommendation contracts | **Not done**: skipped in the order the prompts were given (prompt 8 came next) |
| 8 | Personal records, ownership and consent schema | **Done** (migration 0016 not yet applied to production) |
| 9 | Versioned knowledge releases and publication | **Done** (migration 0017 not yet applied to production; no release activated there) |
| 10 | Durable quotas and bounded API inputs | **Done** (migration 0018 not yet applied to production) |
| 11 | Cached public rendering and client loading | **Done** |
| 12 | Cart and wishlist ownership synchronization | **Done** (browser verification and build not run: usage limit) |
| 13 | Lightweight Bayesian inference core | **Done** |
| 14 | Candidate selection, budget and owned products | **Done** |
| 15 | Actual weekly routine planner | **Done** |
| 16 | Private routine APIs and server recomputation | **Done** |
| 17 | Desktop routine finder and result experience | **Done** (not browser-verified) |
| 18 | Knowledge assistant without an LLM | **Done** (not browser-verified) |
| 19 | Freeze and measure the live desktop reference | **Done** |
| 20 | Desktop design primitives and route shell | **Done** (behind `NEXT_PUBLIC_REDESIGN`) |
| 21 | Full-screen hero and desktop menu replica | **Done** (behind `NEXT_PUBLIC_REDESIGN`; hero photograph pending) |
| 22 | Complete Nuvē-style landing page | **Done** |
| 23 | Desktop catalogue, product, bag and checkout | **Done** |
| 24 | Desktop account, orders, journal and support | **Done** |
| 25 | Staff CMS and knowledge operations | **Done** |
| 26 | Optional desktop capture and private scan sessions | **Done** (flagged off) |
| 27 | Evaluated image inference and evidence integration | **Done** (disabled: no evaluated model) |
| 28 | Feedback, privacy lifecycle and observability | **Done** |
| 29 | Promotions, loyalty, reviews and newsletter | **Done** (coupons and loyalty not built: no rules) |
| 30 | Desktop acceptance, performance and handoff | **Done** (handoff: `docs/handoff-2026-10-09.md`) |

## Audit register

| Audit ID | Status |
| --- | --- |
| 01 Irritated profile keeps vitamin C and exfoliant | **Resolved** in prompt 3 |
| 02 Pregnancy "prefer not to say" coerced to no | **Resolved** in prompt 3 |
| 03 Generic twice-daily directions | **Resolved** in prompt 3 for the routine finder and product pages; approved directions themselves are missing (see below) |
| 06 Beginner gets 12 steps and 9 products | **Resolved** in prompt 3 |
| 11 Very reactive users still get exfoliation | **Resolved** in prompt 3 |
| 18 Highlights matched by exact string; unknown read as safe | **Resolved** in prompt 6: normalised alias map, ambiguity and unresolved states reported; highlights never count as formulation coverage |
| 17 Quiz answers saved by default, no consent or retention | **Resolved** in prompt 8 for new data: nothing is saved without routine-saving consent, every saved record expires; the one legacy row awaits your decision (see prompt 8) |
| 07 Unimplemented offers advertised | **Resolved** in prompt 4: removed until prompt 29 builds them |
| 08 Delivery copy contradicts checkout | **Resolved** in prompt 4: one source in `lib/money.ts` |
| 09 Absolute and unsubstantiated claims | **Resolved** in prompt 4 for repository copy; CMS publish now refuses them. Published CMS text was not reachable offline (see prompt 4) |
| 10 Policy placeholders and dummy support details | **Partly resolved** in prompt 4: dummy WhatsApp removed, every gap listed by `npm run check:launch`; the details themselves need the owner |
| 04 Bag ignores size price, sale and override | **Resolved** in prompt 2 |
| 05 Quantity ignored by Add to Cart | **Resolved** in prompt 2 |
| 25 Unguarded storage, unvalidated cart shape | **Partly resolved** in prompt 2: cart storage is versioned, validated and guarded with an in-memory fallback; wishlist and user reads are guarded and shape-checked. Server-cart restore remains for prompt 12. |
| 24 Portable build | **Resolved** in prompt 1 |
| 29 Build-time content policy | **Resolved** in prompt 1: unreachable database fails the build, offline builds are explicit, production refuses to build without a database |
| All IDs | Final status per audit ID: `docs/handoff-2026-10-09.md` §8 (open: 22 brand assets; partly: 03 directions, 10 support details, 27 media CSP) |

## Re-audit remediation (10 October 2026)

All findings of the 9 October desktop re-audit (A01–A22) addressed in code; finding-by-finding record in [`docs/remediation-checklist-2026-10-10.md`](remediation-checklist-2026-10-10.md), handoff in [`docs/handoff-2026-10-10.md`](handoff-2026-10-10.md), product onboarding in [`docs/product-onboarding.md`](product-onboarding.md).

**Checks:**
- Typecheck clean; lint 0 errors.
- Full suite with 2 workers: 987 passed, 3 skipped, 1 timed out under load (`bayes.test.ts` browser-parity bundle; 30/30 alone).
- Audit reproduction script re-run: every case now fixed.
- Production builds pass in `sample` and `verified` catalogue modes.
- Three-width acceptance pass (30 screenshots in `docs/redesign-reference/acceptance/2026-10-10/`): no accessibility findings, no overflow, CLS 0.
- Database-backed browser matrix on a disposable local Postgres (`scripts/acceptance-env.mjs`): passed. Four defects found and fixed (review publish deleted reviews; COD orders could not be dispatched; guest routines missing on the account page; sample notice over the footer).

**Not done:**
- Razorpay sandbox (no test keys); real webcam; field performance.
- Production remains **not launch-ready**: verified products, assets, reviewed knowledge, support details and owner decisions are outstanding (handoff §Owner decisions).
