::part Architecture
How the system is put together: where it runs, the layers a request passes through, how data is stored, how background work happens, and how pages stay fast.

# Architecture overview {#arch}

Avyora is one Next.js application. The same codebase serves the public shop, the customer account area, the owner console, the stockroom and every API. It runs on Vercel as serverless functions, keeps all durable state in one Postgres database, and talks to a handful of outside services for payments, couriers, email, WhatsApp and AI.

## The big picture

```
                 Customers, staff, search engines
                               |
                     Vercel edge network (CDN)
        cached public pages, images, static files, security headers
                               |
                    Middleware (edge runtime)
        security headers, browse rate limit, staff sign-in gate
                               |
                 Next.js functions (Node runtime)
   pages and server components | server actions | API route handlers
                               |
          Application code: src/lib, src/modules, src/infrastructure
     orders, payments, stock, shipping, routines, CMS, rate limits,
          events, jobs, cache, audit, observability, AI chat
                               |
   +---------------+-----------+------------+---------------------+
   |               |                        |                     |
 Neon Postgres   Optional Redis        Outside services       Vercel Cron
 (source of      (shared cache)        Cashfree, Shiprocket,   daily sweep,
  truth)                               Gmail/Resend, WhatsApp, event backstop
                                       Anthropic, Google OAuth,
                                       Open-Meteo
```

## Three kinds of server code

Every request that is not a cached file ends up in one of three places:

| Kind | Used for | Examples |
| --- | --- | --- |
| Server-rendered pages | Pages whose HTML is built on the server, cached where possible | Home, product pages, owner console, dispatch queue |
| Server actions | Form submissions from the site's own pages | Place order, save price, mark packed, book courier |
| API route handlers | Anything called by the browser's scripts or by outside services | Payment creation and webhooks, courier webhook, cart sync, AI chat, cron jobs |

Server actions carry Next.js's own origin check. API route handlers that change data check the request's `Origin` header against the site's own address (`isSameOrigin` in `src/lib/security.ts`), so another website cannot submit to them on a visitor's behalf. Webhooks from Cashfree and Shiprocket are the exception: they come from outside, so they are verified by a signature or a shared token instead.

## A request, end to end: placing a cash-on-delivery order

1. The customer presses **Place order** on `/checkout`. The browser sends only product ids, sizes, quantities, the address and a random idempotency key. It never sends a price.
2. The `placeOrder` server action checks the checkout rate limit (10 per 10 minutes per person and per address).
3. `createOrder` in `src/lib/orders.ts` validates every field, looks up every price on the server (including owner offers), and refuses with "price changed" if the price the customer saw is no longer current.
4. In **one database transaction**, it reserves the stock (an update that only succeeds if enough units remain), saves the address, the order and its lines, and writes an `order.placed` event to the event log.
5. The transaction commits. If two identical requests raced, the unique index on the idempotency key lets only one order exist, and the loser is answered with the winner's order.
6. After the response has gone, the event drain runs: the cash-on-delivery risk check scores the order, the confirmation email and owner alert are sent, and cached pages showing that product's stock are refreshed.
7. The customer lands on `/orders/AVY-XXXXXX`, a private page reachable only by the signed-in owner of the order or with a signed link bound to that order number.

The same pattern (validate on the server, change state in one transaction, record an event, do slow work afterwards) runs through the whole system.

## Design principles

These decisions shape almost everything in the codebase.

| Principle | What it means in practice |
| --- | --- |
| Postgres is the only source of truth | Orders, money, stock, accounts, content, events, jobs and rate limits all live in Postgres. Caches and copies can be lost without losing anything. |
| Never trust the browser with money | Prices, totals and payment status are always computed or confirmed on the server. |
| One transaction per state change | Stock, order and event are written together or not at all. |
| Retries must be harmless | Idempotency keys on orders and routines; payment and courier events recorded once by their provider id; every status change is a compare-and-set. |
| Fail closed for anything costly or sensitive | Sign-in, checkout, payment, AI chat and staff actions refuse when their safety checks cannot run. Cheap cached reads stay open. |
| Honest by default | No offer, claim, review, score or direction is shown unless it really exists and was approved. |
| Portable | Standard Postgres, self-hosted auth, no platform-only SDKs. Moving to AWS later is a change of settings and a Dockerfile, not a rewrite. |

# Technology stack {#stack}

## Main components

| Layer | Technology | Version | Why |
| --- | --- | --- | --- |
| Framework | Next.js (App Router) | 15.5 | Server rendering, static generation, server actions and API routes in one codebase |
| UI | React, Tailwind CSS, Radix UI | React 18.3, Tailwind 3.4 | Accessible components, a measured design system (`nv-` tokens) |
| Language | TypeScript | strict | Types shared by browser and server |
| Database | PostgreSQL on Neon | 18 | Managed, branchable (copies for rehearsals), pooled connections for serverless |
| Database access | Drizzle ORM over postgres-js | Drizzle 0.45 | Typed queries; every value sent as a bound parameter |
| Validation | Zod | 3.24 | Strict schemas at every trust boundary |
| Customer sign-in | Auth.js (NextAuth v5) with the Drizzle adapter | 5.0 beta | Google sign-in, database sessions that can be revoked |
| Staff sign-in | Own implementation | — | PBKDF2 password hashes, signed httpOnly cookie, emailed second step for the owner |
| Payments | Cashfree PG (Razorpay kept for older orders) | API 2025-01-01 | Indian payment methods, UPI |
| Couriers | Shiprocket API | v1 external | Courier selection, AWB, pickup, labels, tracking webhooks |
| AI | Anthropic Claude Haiku 5.5 via `@anthropic-ai/sdk` | SDK 0.133 | The cheapest current Claude model, good enough for a skincare guide |
| Error reporting | Structured JSON logs; Sentry when configured | Sentry 10 | Works with no vendor; redacts personal data first |
| Tests | Vitest with PGlite (Postgres compiled to WebAssembly) | Vitest 4.1 | Integration tests run real SQL from the real migrations |
| Images | sharp, Next.js image optimiser | — | Re-encodes uploads (strips location data), serves AVIF and WebP |

## Outside services and what happens if each is down

| Service | Used for | If it is unavailable |
| --- | --- | --- |
| Neon Postgres | Everything durable | Public pages still render from cache, showing list prices and "out of stock"; checkout, sign-in and staff actions refuse with a clear message |
| Cashfree | Online payments | Online payment is refused; cash on delivery still works; reconciliation settles any payment whose confirmation was missed |
| Shiprocket | Courier booking and tracking | "Book courier" shows the error and the order stays packed; staff can move orders by hand; tracking catches up when updates resume |
| Gmail or Resend | Order emails and sign-in codes | Email-code sign-in is hidden; failed order emails are retried up to five times; owner two-step sign-in can be switched off |
| Meta WhatsApp | Owner order alerts and morning summary | Alerts are skipped and logged; email still goes |
| Anthropic | AI skin chat | The chat says it is unavailable; nothing else is affected |
| Google OAuth | Google sign-in | Email, password and phone sign-in still work |
| Open-Meteo | UV and air-quality notes on the account page | The note is simply not shown |
| Upstash Redis (optional) | Shared cache | Reads go to Postgres: slower, still correct |

# How the code is organised {#code}

The code is in `src/`. A map produced by the graphify tool on 12 October 2026 counted 453 files (about 268,000 words), grouped into 105 clusters of closely related code. The main folders:

| Folder | What lives there |
| --- | --- |
| `src/app/` | Every page and API route. The folder path is the web address: `src/app/admin/pricing/page.tsx` is `/admin/pricing`. |
| `src/components/` | Shared interface pieces: the design system (`nv/`), the bag drawer, admin widgets, the assistant panel |
| `src/lib/` | Core business logic: orders, money, stock, payments, notifications, rate limits, sign-in, observability |
| `src/modules/` | Larger self-contained areas, each with its own tests: catalogue, payments, shipping, inventory, knowledge, personalisation, CMS, scans, skin chat, reviews, support, newsletter, audit |
| `src/infrastructure/` | Plumbing: tiered cache, idempotency, job queue, object storage, event streaming, request ids |
| `src/db/` | The database schema (`schema.ts`) and connection set-up, including the read-replica router |
| `src/data/` | The catalogue file and other reviewed data: products, directions, formulations, knowledge records |
| `drizzle/` | Database migrations, applied in order |
| `scripts/` | Command-line tools: migrations, stock seeding, environment checks, load test, acceptance runs |
| `docs/` | Design notes, audits, handoffs and runbooks |

## Modules

| Module | Responsibility |
| --- | --- |
| `catalog` | Product and SKU identities, display prices and stock for the storefront, catalogue integrity checks |
| `payments` | The payment state machine, provider event recording, webhook policy |
| `shipping` | Shiprocket booking, tracking updates, cash-on-delivery collection |
| `inventory` | Stock commands (set, adjust) and the morning autopilot |
| `knowledge` | Reviewed skincare knowledge: records, compiler, immutable releases, rollback |
| `ingredients` | Ingredient dictionary, alias resolution, formulations, interaction rules |
| `personalization` | Bayesian concern inference, product selection, the weekly planner, routine contracts |
| `personal` | Saved routines, consent records, guest ownership |
| `assistant` | Ask Avyora, the on-device question answerer |
| `skin-chat` | The AI skin chat: prompt, limits, urgent-symptom detection, cost |
| `cms` | Content documents, revisions, publish checks, media |
| `scans` | Optional face-photo sessions (switched off) |
| `ai` | The skin image analysis lifecycle (switched off, no model) |
| `reviews`, `support`, `newsletter`, `wishlist`, `search`, `recommendations`, `analytics`, `audit`, `operations` | As named |

## Naming conventions worth knowing

- **Paise everywhere.** Any variable ending `Paise` is whole paise. Rupees appear only at the edges: forms and outside APIs.
- **`skuKey`** is `productId::size`, the legacy way to name a SKU. **`variantId`** is the stable SKU id such as `retinol-90ml`.
- **`.integration.test.ts`** files run against a real Postgres engine built from the migrations.
- **`ponytail:`** comments mark deliberate simplifications with a known limit and the upgrade path.
