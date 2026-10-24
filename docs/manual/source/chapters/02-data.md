# Data and storage {#data}

PostgreSQL is the system of record. Everything else (the optional Redis cache, the event stream, the analytics export, uploaded media) is derived from it or sits in front of it, and can be lost without losing a customer's order.

| Store | Holds | Authoritative? | If it disappears |
| --- | --- | --- | --- |
| PostgreSQL (Neon, Singapore, version 18) | Orders, payments, stock, prices, carts, accounts, content, events, jobs, audit, rate limits | Yes | Restore from backup (below) |
| Redis (Upstash, optional) | Cached copies of display data, carts and content | No | Reads go to Postgres: slower, still correct |
| Object storage, media (optional) | Images uploaded through the CMS | Yes, for the image bytes | Articles lose hero images; the catalogue is unaffected |
| Object storage, analytics (optional) | A copy of the event log | No | Re-export from the event log |
| Kafka (optional) | A stream copy of events | No | Replay from the event log |

The full list of 51 tables and 428 columns is in Appendix A.

## The data, grouped

| Group | Tables | What they hold |
| --- | --- | --- |
| Customers and sign-in | users, accounts, sessions, verification_tokens, otp_codes, addresses | Accounts, sign-in sessions and codes, delivery addresses |
| Catalogue and pricing | catalog_products, catalog_variants, product_pricing | Product and SKU identities; owner prices and offers, versioned |
| Stock | inventory, restock_requests | Units on hand per SKU; requests for more |
| Shopping | carts, cart_items, wishlist_items | Server copies of bags and wishlists |
| Orders and money | orders, order_items, payment_events, idempotency_keys | Every order, its lines, every payment event, safe retries |
| Personal records | consent_records, skin_profiles, routine_results, routine_schedule_slots, routine_feedback, scan_sessions, scan_admissions, scan_attempts | Saved routines and photos, only with permission and always with an expiry |
| Knowledge | ingredients, ingredient_aliases, ingredient_interactions, formulations, formulation_ingredients, usage_profiles, evidence_sources, kb_releases, kb_active_release | Reviewed skincare knowledge and its immutable releases |
| Content | cms_documents, cms_revisions, media_assets | Site copy, articles, media, every revision |
| Operations | domain_events, event_deliveries, consumer_registrations, jobs, audit_logs, rate_limits, export_watermarks, activity_events | The event log, job queue, audit trail, rate-limit counters, analytics |
| Customer contact | reviews, support_requests, newsletter_subscribers | Moderated reviews, contact messages, newsletter sign-ups |
| Other | environmental_cache, routine_items | Weather readings cache; legacy routine lines |

## How an order is stored

An order is one row in `orders` and one row per line in `order_items`.

- **Totals** (`subtotal`, `discount`, `shipping`, `tax`, `total`) are whole paise. GST at 18% is already included in catalogue prices; `tax` records the GST portion of the total.
- **The delivery address is frozen** onto the order as JSON (`shipping_address`), so a customer editing their address book later cannot change where a past order went.
- **Each line freezes the product name, size and unit price** at the time of sale, plus a `pricing_snapshot` explaining why it cost that (catalogue price, owner override, or offer, with the pricing version).
- **Two statuses** move independently: `status` (pending, paid, fulfilled, shipped, out_for_delivery, delivered, cancelled, refunded, returned) and `payment_status` (unpaid, pending, authorized, paid, failed, refunded).
- **Safety fields:** `idempotency_key` (unique, makes a retried checkout return the same order), `stock_restored_at` (stock can be returned exactly once), `fraud_status` and `fraud_score` (the cash-on-delivery risk check), and `attention_reason` (set when the owner must decide something).
- **Courier fields:** `awb` (the tracking number, unique) and `shipment` (courier name, label link, latest courier status), added on 21 October 2026 by migration 0022.

## Reading and writing

Every read declares how fresh it must be. The primary database serves all writes and every read that must be current: checkout, stock, payments, carts, editors, and every cache refill. Sales reports may read from an optional read replica when one exists and is less than 30 seconds behind. The read router (`src/db/read-router.ts`) checks the replica's lag at most every 10 seconds, falls back to the primary if it is lagging or unreachable, and never retries a failed SQL statement on the primary, since that could hide a write sent to a read-only copy.

> **Note.** No read replica exists today. Every read goes to the primary. Adding one means creating a read-only compute on Neon and setting `DATABASE_READ_URL`.

## Connections

Each server instance keeps a small connection pool (5 connections in production) through Neon's pooler, which multiplexes thousands of short-lived serverless clients onto a few database connections. Migrations and backups use a direct connection, because they need session-level behaviour the pooler does not keep. The practical ceiling is the database's compute size (0.25 compute units on the free plan), not the number of connections.

## Migrations

The schema is defined in `src/db/schema.ts` and created by numbered SQL migrations in `drizzle/` (0000 to 0022, listed in Appendix D). Rules the project follows:

- **Additive first.** New tables and columns are added without breaking the code already running; destructive changes ship with a data check.
- **Tests use the real migrations.** Test databases are built by running the same migration files, so a test cannot pass against a schema production does not have.
- **Production is migrated by hand, after approval:** `npm run db:migrate` with the production connection string, ideally rehearsed on a Neon branch (a copy of production) first.

## Backups and recovery

| Setting | Value | Meaning |
| --- | --- | --- |
| Neon point-in-time history | 6 hours (free plan) | Any moment in the last 6 hours can be restored to a new branch |
| Nightly logical backup | Written, not yet running | `.github/workflows/backup.yml`: `pg_dump`, a readability check, AES-256 encryption, upload to private storage. It waits for six `BACKUP_*` secrets in the repository. |

| Scenario | What you get back | How long | How |
| --- | --- | --- | --- |
| Mistake noticed within 6 hours | Everything up to seconds before the mistake | About 15 minutes | Neon point-in-time restore to a new branch, check it, then copy rows back or switch to it |
| Mistake noticed later | The last nightly dump (once backups run) | About 1 hour | Restore the dump into a new branch (Chapter [[runbooks]]) |
| Neon project lost | The last nightly dump | A few hours | Restore into any Postgres 18, repoint `DATABASE_URL` |
| Redis or analytics copies lost | Nothing lost | None | They refill from Postgres |

> **Decision needed.** Until the nightly backup runs, the only safety net is 6 hours of history. Setting the backup secrets (Chapter [[launch]]) is one of the highest-value tasks before launch.

# Events and background work {#events}

Slow or unreliable work, such as sending an email, calling WhatsApp, refreshing cached pages or scoring a cash-on-delivery order, never runs inside the customer's request. It is recorded as an event and done afterwards. This keeps checkout fast, and means a failing email provider cannot fail an order.

## The event log (transactional outbox)

When something important happens, a row is written to `domain_events` in the **same transaction** as the change itself. If the order commits, its event exists; if it rolls back, the event never existed. Events carry only an id and an order number; consumers re-read the current state when they act.

| Event | Written when |
| --- | --- |
| `order.placed` | An order is created (any payment method) |
| `order.paid` | A payment is confirmed (online, or cash collected on delivery) |
| `order.payment_failed` | A payment attempt fails |
| `order.refunded` | A refund is recorded |
| `order.cancelled` | An order is cancelled |
| `order.shipped` | The courier picks the parcel up |
| `order.needs_attention` | The owner must decide something (late payment, lost parcel, return needing a refund) |
| `inventory.stock_out`, `inventory.changed` | Stock reaches zero or changes |
| `pricing.changed` | An owner edits a price or offer |
| `content.published`, `content.unpublished` | CMS content changes |

## Consumers

Each consumer reads the log independently and records its own progress in `event_deliveries`, so one slow consumer cannot hold up another.

| Consumer | Acts on | What it does |
| --- | --- | --- |
| `notifications` | `order.placed` (cash on delivery), `order.paid` (online), `order.shipped` | Customer confirmation email, owner email and WhatsApp alert; the "on its way" email with tracking link |
| `cod-risk` | `order.placed` for cash on delivery | Scores the order and holds risky ones for the owner (Chapter [[owner]]) |
| `revalidate` | Stock, price and content events | Refreshes the cached pages that show the changed data |
| `stream-relay` (optional) | Everything | Copies events to Kafka when one is configured |

> **Why online orders are announced only when paid.** Until 12 October 2026, an online order was announced the moment the customer pressed Pay. A customer who backed out of the payment screen still received "order confirmed", and the owner got an alert for a sale that never happened. Now online orders are announced on `order.paid`, and cash-on-delivery orders on `order.placed`.

## When events are processed

- **Straight away.** After checkout, a payment confirmation or a courier update, the drain is scheduled with Next.js `after()`, which runs once the response has been sent.
- **Daily backstop.** `/api/cron/events` runs every day at 09:15 India time and processes anything still pending.
- **Retries.** A failed consumer retries with growing waits (30 seconds, 1, 2, 4 then 8 minutes), up to 5 attempts. After that the delivery is marked failed with its error and shown in the owner console under System, where it can be replayed.

## The job queue

Work that is not a reaction to an event (for example a future photo-analysis job) uses the `jobs` table, a Postgres queue with leases. Workers claim jobs with `FOR UPDATE SKIP LOCKED`, so two workers never take the same job; each claim has a 60-second lease; completion is fenced so a worker whose lease expired cannot overwrite a newer result; failures back off and finally become dead letters that the owner can replay.

## Scheduled jobs

Vercel Cron calls two protected addresses. Both refuse any caller without the `CRON_SECRET` bearer token.

| Job | Schedule (UTC / India) | What it does |
| --- | --- | --- |
| `/api/cron/sweep` | 03:15 / 08:45 daily | Cancels online orders abandoned at payment (asking Cashfree first) and returns their stock; prunes old idempotency keys and rate-limit counters; deletes expired routines, saved answers, scan photos and unconfirmed newsletter sign-ups; runs the stock autopilot and sends the morning summary |
| `/api/cron/events` | 03:45 / 09:15 daily | The event drain backstop |

> **Plan limit.** Vercel's free plan allows only daily cron jobs. On the Pro plan, change them in `vercel.json` to every 15 minutes (`*/15 * * * *`) for the sweep and every 6 hours for the events backstop, so abandoned stock is released sooner.

# Caching and rendering {#caching}

Most visitors only read. The system is built so that reading costs almost nothing: public pages are pre-built HTML served from Vercel's edge, and the database is touched only when something changes.

## How each kind of page is served

| Pages | How | Refresh |
| --- | --- | --- |
| Home, collections, 27 product pages | Pre-built (incremental static regeneration) | Every 60 seconds, and immediately when stock, price or copy changes |
| Journal and articles | Pre-built | Every 5 minutes, and on publish |
| Policies, contact, routine finder, wishlist | Fully static | On deploy |
| Sitemap | Pre-built | Hourly, and on article publish |
| Account, checkout, orders, sign-in, staff consoles, private APIs | Built per request | Never cached: `private, no-store`, varied by cookie |

The middleware stamps `private, no-store` on every personal page and API regardless of how it was rendered, so a configuration mistake cannot make one customer's page cacheable for another. `scripts/measure-pages.mjs` checks this and fails if any private address becomes cacheable.

## The tiered cache

Display data (prices and stock on product cards, CMS content, ingredient data, recommendations) goes through a two-level cache:

| Level | Where | Purpose |
| --- | --- | --- |
| L1 | Memory of each server instance | Seconds-long copy; removes repeated reads within one instance |
| L2 | Redis (optional) | Shared between instances; minutes to hours |
| Source | Postgres | Always correct |

| Data | L1 | L2 | Notes |
| --- | --- | --- | --- |
| Display prices | 5 s | 60 s | Checkout never uses these; it reads Postgres fresh |
| Stock for display | 5 s | 30 s | A sold-out badge a few seconds stale is tolerable; overselling is impossible because reservation happens in the database |
| CMS content | 60 s | 1 hour | Publishing invalidates it at once |
| Ingredients | 5 min | 1 day | Changes only with a knowledge release |
| Carts and wishlists | none | 30 min | |
| Recommendations | 5 min | 1 hour | |
| Weather conditions | 5 min | 30 min | |

Every change that affects a cached value invalidates it explicitly; the times above are only a backstop.

## When the database is down

Since 21 October 2026, the storefront survives a database outage. If the stock or price read fails, product pages still render with the catalogue's list prices and every item marked "Out of stock" (nothing can be ordered during an outage anyway). The fallback is reported to the error log and **not cached**, so real figures return as soon as the database answers. Checkout deliberately does not fall back: it fails loudly rather than charge a price that might be wrong.

## Page weight

| Bundle | Size (first-load JavaScript) |
| --- | --- |
| Shared by every page | 103 KB |
| Home | 139 KB |
| Product page | 142 KB |
| Routine finder | 167 KB (includes the routine engine, so routines compute on the device) |

Sentry's error-reporting code is loaded only when a reporting address is configured, and then after the page, which cut the shared bundle from 195 KB to 103 KB.

# Search engines, accessibility and design {#seo}

## Search engines

The shop is built so search engines see real content, fast:

| Measure | Detail |
| --- | --- |
| Pre-built HTML | Home, collections, all 27 product pages and the journal are pre-built, so crawlers get full content without running scripts. The collections page's HTML contains the whole product grid |
| Sitemap | `/sitemap.xml`, rebuilt hourly and whenever an article is published |
| Robots rules | `/robots.txt` allows everything public and disallows `/admin`, `/api`, `/checkout`, `/orders`, `/login` and `/signup`, and points to the sitemap |
| Canonical addresses | Each public page declares its own canonical URL. (An earlier version declared the home page as canonical for every page, which told search engines to ignore the rest; fixed in the October re-audit) |
| Product structured data | Each product page carries schema.org Product data: name, description, image, brand, offers with the current price and availability. A rating appears only when published, verified-purchase reviews exist |
| Private pages | Never indexed: account, checkout, orders, staff consoles and newsletter pages are marked no-index, and never cached |
| Speed | Shared JavaScript 103 KB; layout shift 0; HTML 7 to 20 KB compressed |
| Site address | Everything is built from `NEXT_PUBLIC_SITE_URL`, so moving to the shop's own domain is one setting (plus the redirects in Chapter [[services]]) |

Bots are handled with care for search: known search engines are checked **before** any blocking rule, so no change to bot handling can accidentally de-index the shop. Scrapers with obvious tool names (`python-requests`, `scrapy`, `wget`, `sqlmap` and similar) are refused, and page views are limited to 120 a minute per address at the edge.

## Accessibility

Accessibility was checked with automated passes at 1280, 1440 and 1920 pixels wide and by keyboard. The last pass found no issues.

| Area | What is in place |
| --- | --- |
| Structure | One main heading per page; headings in order (the collections and product pages gained hidden section headings to avoid skipping levels); page language set |
| Keyboard | A "skip to content" link; every control reachable in a sensible order; a visible 2-pixel focus outline for keyboard users only; the menu traps focus while open and returns it to the menu button on Escape |
| Forms | Every field has a label; errors are linked to their field (`aria-invalid`, `aria-describedby`) and announced (`role="alert"`) |
| Images | Every image has alternative text; a failed image keeps its space and shows the text |
| Motion | Animations are skipped under "reduce motion"; content never stays hidden waiting for an animation |
| Dialogs | The bag drawer and dialogs trap focus, close on Escape, and hide the background from screen readers |
| Live updates | The routine finder marks recalculation as busy; the chat reads replies as they arrive (`aria-live`) |
| Zoom | At 200% zoom the header controls fit and stay reachable; some desktop grids need horizontal scrolling until the narrow layouts are built |

> **Not yet done.** Mobile and tablet layouts were deferred by the owner until the desktop design is approved. At narrow widths the site works but is not yet designed for them.

## The design system

The current design (switched on with `NEXT_PUBLIC_REDESIGN=1`) was measured from a reference site at three widths and rebuilt to within a few pixels: section heights at 1440 pixels match the reference to 0 to 4 pixels over an 11,400-pixel page.

| Token | Value |
| --- | --- |
| Page background | #FAFAFA |
| Text | #1A1A1A |
| Muted text | #696666 |
| Faint text | #ADADAD |
| Cards | #FFFFFF |
| Lines | #E8E8E8 |
| Layout | 1240-pixel centred column; 40-pixel side gutters; 8-pixel grid gaps |
| Corners | 18 px cards, 12 px inner panels, fully rounded buttons |
| Header | 76 px |
| Type | Inter (400 and 500) for text and headings; Instrument Serif for the wordmark. Both self-hosted through `next/font`, with metric-matched fallbacks so text does not jump when the font loads |
| Type scale | Hero 100/100 px, section headings 80/88, card titles 32, body 16 to 20 |

The building blocks live in `src/components/nv/`: containers, sections, grids, headings, buttons (dark, light, outline, ghost), cards, status messages, spinners, skeletons, form fields, an accordion, a dialog and an image component that never collapses. A review page at `/design-system` (not linked, not indexed) shows each one in every state.

## Photography

No approved photography exists yet. The product photos are stock images, and one of them (used for the Centella Cleansing Balm, the Ceramide Cream and the Water-Gel Sorbet Moisturizer) shows another brand's label. It is kept off the home page but still appears on those product pages. Replacing it is a launch blocker. The image slots and their sizes are listed in `docs/product-onboarding.md`.

