::part Developer reference
The main flows traced step by step through the code, and the request and response formats of the API.

# Key flows, step by step {#flows}

Each flow names the file that does each step, so a developer can follow it in the code.

## Online payment with Cashfree

```
Browser (checkout)          Avyora server                         Cashfree
------------------          -------------                         --------
Pay  ---------------------> POST /api/payments/cashfree/create
                            same-origin, rate limit, createOrder()
                            (prices, stock reserved, order.placed)
                            createCashfreeOrder() ------------------> order + session
                            order.payment_reference set
                            payment state: session_opened
                            reconciliation job scheduled
       <------------------- { paymentSessionId, orderNumber, accessToken }
rememberAttempt()
Cashfree checkout opens --------------------------------------------> customer pays
                                                                       |
                            POST /api/webhooks/cashfree  <------------+ signed event
                            verify signature (raw body)
                            recordProviderEvent(): once per event id
                            decide(): amount == total -> paid
                            order.paid event -> drain after response
Return page -------------->  POST /api/payments/cashfree/verify
                            asks Cashfree for payments (not the browser)
       <------------------- { status: "paid" }
Confirmation shown; bag cleared; email and owner alert sent
```

| Step | File |
| --- | --- |
| Create the order and payment session | `src/app/api/payments/cashfree/create/route.ts`, `src/lib/orders.ts`, `src/lib/cashfree.ts` |
| Remember the attempt in the browser | `src/lib/payment-attempt.ts`, `src/app/checkout/checkout-client.tsx` |
| Webhook | `src/app/api/webhooks/cashfree/route.ts` |
| Record and apply events | `src/modules/payments/payment-service.ts`, `state-machine.ts` |
| Return page | `src/app/checkout/return/page.tsx`, `src/app/api/payments/cashfree/verify/route.ts` |
| Announce | `src/lib/event-consumers.ts`, `src/lib/order-notifications.ts` |

## Backing out of the payment screen

1. The customer presses Back or closes Cashfree's page. The checkout page fires `pageshow` (or the return page loads) and finds the remembered attempt.
2. The browser calls `POST /api/payments/cashfree/cancel` with the order number and its access token.
3. The server asks Cashfree to terminate the order (`PATCH /pg/orders/{id}` with `order_status: TERMINATED`) and re-reads its state.
4. **TERMINATED or EXPIRED:** `releaseIfUnpaid` cancels the order and returns its stock, exactly once. Answer: `cancelled`.
5. **PAID** (paid in the meantime): the payment is applied instead. Answer: `paid`.
6. **Anything else** (a payment in progress): nothing changes. Answer: `pending`; the sweep will ask again later.
7. The page resets the Pay button and makes a new idempotency key. A retry with the old key gets `409 attempt_closed`, never a reopened attempt.

## A parcel's life

```
Manager: Mark packed        order.status = fulfilled
Manager: Book courier       bookCourier()  (src/modules/shipping/shipments.ts)
                              claim: orders.shipment = {booking:true} where null
                              Shiprocket: login, create adhoc, assign AWB,
                                          generate pickup, generate label
                              orders.awb, orders.shipment saved; audit row
Courier picks up            POST /api/webhooks/courier  (x-api-key checked)
                              status 42 -> shipped, order.shipped event
                              -> "on its way" email with tracking link
In transit / delayed        recorded on the shipment; order unchanged
Out for delivery (17)       -> out_for_delivery
Delivered (7)               -> delivered; COD recorded as paid
  or Undelivered (21)       attention set; owner alerted
  or RTO delivered (10)     -> returned; stock restored once; refund flagged if prepaid
```

## A chat message

1. `POST /api/chat` with the conversation so far (user and assistant turns only).
2. Same-origin check; a 503 if no Anthropic key is configured; a size-bounded body; a strict schema (1 to 40 messages, each 1 to 1,000 characters, the last from the user).
3. A 401 if not signed in.
4. Rate limits checked together: 8 a minute, today's spend under ₹0.50 (checked without adding), and the site-wide 2,000 a day. If any fails: 429, and the model is never called.
5. The history is trimmed to the latest 12 turns, starting with the customer and alternating.
6. The urgent-symptom check runs on the latest message; if it matches, the doctor notice is streamed first.
7. The model is called with the fixed, cached system prompt, adaptive thinking at low effort, and a 1,200-token cap. Text streams back as it is written.
8. After the reply, `replyCostPaise(usage)` is added to the person's daily spend, and a log line records tokens and cost. If the model refused, a polite redirect is sent; if the provider failed, an apology.

## The morning sweep

1. Vercel Cron calls `GET /api/cron/sweep` with the `CRON_SECRET` bearer token.
2. Abandoned online orders: each is reconciled with its provider first; only "not paid" or "no session" cancels and restocks.
3. Housekeeping: expired idempotency keys, rate-limit counters, routines, saved answers, scan photos and rows, unconfirmed newsletter sign-ups.
4. Stock autopilot: restock requests raised; the morning summary sent.
5. The response lists the count of each, so a manual run shows what happened.

# Order and payment lifecycle {#lifecycle}

Every way an order's two statuses can change, and who or what changes them. Any transition not listed here is refused by the code.

## Fulfilment status

| From | To | Triggered by | Where |
| --- | --- | --- | --- |
| (new) | pending | Checkout creates the order | `createOrder` |
| pending | paid | A captured payment equal to the total | Payment state machine |
| pending, paid | fulfilled ("packed") | Manager or owner: Mark packed. A COD order only once the risk check approved it | Stockroom; owner order page |
| pending | cancelled | Owner; risk check refusal; morning sweep for abandoned online payment; customer backing out of Cashfree | Owner actions; `cod-risk`; `releaseIfUnpaid` |
| paid, fulfilled | cancelled | Owner (refund separately in Cashfree) | Owner order page |
| fulfilled | shipped | Courier pick-up update, or Hand to courier | Courier webhook; stockroom |
| shipped | out_for_delivery | Courier update, or the stockroom button | Courier webhook; stockroom |
| shipped, out_for_delivery | delivered | Courier update, or Mark delivered | Courier webhook; stockroom; owner |
| fulfilled, shipped, out_for_delivery | returned | Courier: delivered back to us (RTO delivered) | Courier webhook |
| cancelled | paid | A payment arriving after cancellation (flagged for the owner) | Payment state machine |

Rules that apply to every change:

- **Compare-and-set.** The update only succeeds if the order is still in the status that was read, so two people (or a person and a courier update) cannot both move it.
- **Courier updates only move forward.** A late "in transit" never undoes "delivered".
- **Stock moves exactly once.** Cancelling or returning claims `stock_restored_at` in the same statement that checks it is empty; a second attempt does nothing.
- **Every change is audited** with who did it (a staff username, or "courier").

## Payment status

| From | To | Signal | Stock effect |
| --- | --- | --- | --- |
| unpaid, failed | pending | A payment session opened (customer pressed Pay) | None |
| unpaid, pending, failed | authorized | Provider authorised the amount (card holds) | Re-reserved if it had been released |
| unpaid, pending, authorized, failed | paid | Captured, amount equals the order total | Re-reserved if it had been released; attention if it was sold meanwhile |
| unpaid, pending | failed | The attempt failed | Released |
| paid | refunded | Refund recorded | — |
| any | (unchanged) | Captured amount differs from the total | Rejected and recorded |
| paid, refunded | (unchanged) | A failed attempt after success | Ignored |
| paid | (unchanged) | A second capture | Ignored as a duplicate |

Cash-on-delivery orders stay **unpaid** until delivered, then receive a captured signal for the order total through the same table.

## Risk status (cash on delivery only)

| From | To | Triggered by |
| --- | --- | --- |
| pending | approved | Score below 40 |
| pending | review | Score 40 or more |
| pending | rejected | Score 70 or more with at least two signals (order cancelled, stock returned) |
| review | approved | Owner: Release for dispatch |
| review | rejected | Owner: Cancel and restock |

Online orders are approved without scoring: the money has already moved.

## Attention

| Set when | Cleared by |
| --- | --- |
| Paid after its stock was sold to someone else | The owner, with a note |
| Paid after the order was cancelled | The owner, with a note |
| The courier reports it undelivered, lost, damaged, destroyed, untraceable, or returning | The owner, with a note |
| Returned while paid online (refund due) | The owner, with a note |

An order with an attention reason is held from dispatch until it is cleared.

## What the customer sees for each state

| Internal state | Customer sees |
| --- | --- |
| pending, paid | Order placed |
| fulfilled | Being prepared |
| shipped | On its way |
| out_for_delivery | Out for delivery |
| delivered | Delivered |
| cancelled, refunded | The tracker stops, with a plain explanation |
| returned | "Returned": the courier could not deliver and brought it back; anything paid online is refunded (fixed 21 October 2026: it used to show "Order placed") |

# API reference {#api}

All routes are under `/api`. Unless stated, a route that changes data requires a same-origin request (the browser's `Origin` must match the site), returns JSON, and on refusal returns `{ "error": "…" }` or `{ "error": { "code", "message" } }` with a matching status code. Private responses carry `Cache-Control: private, no-store`. The full list of 34 addresses is in Appendix B.

## Common status codes

| Code | Meaning |
| --- | --- |
| 400 | The request failed validation |
| 401 | Sign-in required, or a webhook signature or token is wrong |
| 403 | Wrong origin, or not your order |
| 404 | Not found, or not yours (the two are deliberately indistinguishable) |
| 409 | A conflict: price changed, attempt closed, wrong account, stale edit |
| 413 | The body is over its size limit |
| 422 | A valid request with no possible result (for example no routine fits) |
| 429 | Rate limited; `Retry-After` says when to try again |
| 503 | A dependency is not configured or unavailable; `limiter_unavailable` when the rate limiter cannot be reached |

## Catalogue

### GET /api/catalog/availability

Current display prices and stock for up to 50 SKUs.

```
GET /api/catalog/availability?skus=retinol::90ml,ha-toner::200ml
200 { prices: { "retinol::90ml": { price, wasPrice, offerLabel, … } }, stock: { "retinol::90ml": 12 }, quoteVersion, validUntil }
```

An uncounted SKU reports 0 (checkout refuses it); `stock` is null only when the deployment has no database. Cached briefly at the edge (15 seconds, then stale for 30).

### GET /api/catalog/release

The published knowledge release (manifest and artifacts) the browser's routine engine and Ask Avyora use. Public; no personal data.

## Bag, wishlist and sync

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/cart` | — | `{ lines: [{ productId, size, quantity }] }` |
| `POST /api/cart` | `{ lines, accountKey? }` (at most 50 lines, 16 KB) | `{ ok, stored }`; 409 if `accountKey` belongs to another account |
| `GET /api/wishlist` | — | `{ signedIn, productIds }` |
| `POST /api/wishlist` | `{ productIds }` (at most 100) | `{ signedIn, stored }` |
| `GET /api/sync` | — | `{ accountKey, cart, wishlist }` for the signed-in account, all null for a guest |
| `POST /api/sync/merge` | The guest bag and wishlist | The merged state, with any capped or dropped lines explained; 401 if not signed in |

## Payments

### POST /api/payments/cashfree/create

Creates the order and a Cashfree payment session. The body is the checkout input: `email`, `address`, `items` (each `productId`, `size`, `quantity`, optional `expectedUnitPaise`), `idempotencyKey`, and for guests `phoneProof`.

```
200 { paymentSessionId, mode: "sandbox" | "production", orderNumber, accessToken }
409 { error, code: "price_changed" }       price changed since shown
409 { error, code: "attempt_closed" }      that key's attempt was cancelled; make a new key
400 { error }                              validation, stock, sample catalogue
```

### POST /api/payments/cashfree/verify

`{ orderNumber }` → `{ status: "paid" | "pending" | "failed" | "not_started", orderNumber }`. Asks Cashfree; never trusts the browser.

### POST /api/payments/cashfree/cancel

`{ orderNumber, token }` → `{ status: "cancelled" | "paid" | "pending", orderNumber }`. 403 without the order's access token.

### POST /api/webhooks/cashfree

From Cashfree only. Headers `x-webhook-timestamp` and `x-webhook-signature` are verified against the raw body. 401 for a bad signature; 503 (retryable) when the order is not yet visible; otherwise `{ ok, duplicate? }`.

## Deliveries

### POST /api/webhooks/courier

From Shiprocket only. Header `x-api-key` must equal `SHIPROCKET_WEBHOOK_TOKEN`. Body (fields used): `awb`, `shipment_status_id`, `shipment_status`.

```
401 { error: "Invalid token." }
503 { error: "Courier tracking is not configured." }
200 { ok: true, result: "advanced" | "recorded" | "flagged" | "unknown_awb" }
200 { ok: true, ignored: "…" }   not a tracking update
```

## Staff

### POST /api/admin/login

`{ username, password, code? }` (4 KB).

```
200 { ok: true, role: "owner" | "manager" }   and the session cookie
200 { step: "code" }                          owner: a code was emailed; send again with code
401 { error }                                 wrong credentials or code
502 { error }                                 the code could not be emailed
503 { error }                                 staff sign-in not configured
```

### POST /api/admin/logout

Clears the staff session.

## Personal records

| Route | Purpose |
| --- | --- |
| `POST /api/consent` | `{ purpose, policyVersion }`, where purpose is `routine_saving` (or `photo_processing` when hosted scans are on). Answers `{ consent: { purpose, policyVersion, grantedAt } }` |
| `DELETE /api/consent?purpose=` | Withdraws at once |
| `POST /api/routines` | Saves a routine. Needs the `Idempotency-Key` header and routine-saving consent; body is the profile and release id only. The server recomputes the result |
| `GET /api/routines` | The owner's saved routines |
| `GET`, `DELETE /api/routines/[id]` | One routine, with its validity (current, outdated, revoked); delete always answers 204 |
| `POST /api/routines/[id]/feedback` | Weekly feedback (accounts only, once a week) |
| `POST /api/scans`, `POST /api/scans/[id]/upload`, `GET`/`DELETE /api/scans/[id]` | Optional face-photo sessions; 503 `scan_disabled` while switched off |

## Customer contact

| Route | Request | Response |
| --- | --- | --- |
| `POST /api/support` | Name, email, message, contact consent (4 KB) | `201 { ok, reference }` |
| `POST /api/reviews` | `{ productId, rating 1–5, body 20–2000 characters }`; signed in, with a delivered order containing the product | Stored unpublished until moderated |
| `POST /api/newsletter` | Email and consent (switched off) | The same answer whatever the address's state |

## AI chat

### POST /api/chat

`{ messages: [{ role: "user" | "assistant", content }] }`, 1 to 40 messages, each up to 1,000 characters, the last from the user; no other fields (48 KB).

```
200 text/plain stream   the reply, preceded by the doctor notice when urgent
401 { error: "Please sign in to use the skin chat." }
429 { error: { code: "rate_limited", message }, retryAfterSeconds }
503 { error: "The skin chat is not switched on yet." }
```

## Operations

| Route | Caller | Purpose |
| --- | --- | --- |
| `GET /api/health` | Uptime monitors | `200 { status: "ok", database: "ok" }` or `503 { status: "degraded", database: "down" }` |
| `GET /api/cron/sweep` | Vercel Cron (bearer `CRON_SECRET`) | Morning sweep; answers counts |
| `GET /api/cron/events` | Vercel Cron | Event drain backstop |
| `GET /api/cron/scan-retention` | Any scheduler with `CRON_SECRET` (not scheduled yet) | Photo-retention backstop; must run at least hourly before hosted photo analysis is ever enabled |
| `POST /api/activity` | The site | Anonymous usage events |
| `/api/auth/[...nextauth]` | Auth.js | Customer sign-in |
| `GET /api/account/deliver-to` | The site | The header's "Deliver to" line: first name, city and PIN, fetched after the page loads so pages stay cacheable |

# Making common changes {#devguide}

Recipes for the changes a developer is most likely to be asked for, with the files involved and the checks that must pass. Every change should end with `npm run typecheck`, `npm run lint`, `npm test` and `npm run build:offline` passing, as CI requires.

## Getting started

1. Install Node 24 and npm, then `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in at least `DATABASE_URL` (a Neon branch, never production), `AUTH_SECRET` and `SESSION_SECRET`.
3. `npm run db:migrate`, then `npm run db:seed-inventory 25` so products are sellable.
4. `npm run dev` and open http://localhost:9002.
5. For a disposable local database instead of a Neon branch, start Docker Desktop and use the `acceptance` launch entry (port 9006), which creates and migrates its own Postgres container.

Code style: Prettier with single quotes, semicolons, trailing commas and 120-character lines (`npm run format`). Comments explain **why**, not what. Deliberate simplifications carry a `ponytail:` comment naming their limit and how to lift it.

## Add a product or a size

1. Add it to `src/data/mock-data.ts`: id, slug, name, category, concerns, sizes with list prices.
2. Give it a routine role in `src/data/routine-roles.ts` (cleanse, moisturise, protect, treatment, optional or none).
3. Generate the catalogue rows: `npx tsx scripts/catalog-seed-sql.ts --rows`, then create a migration for them with `npx drizzle-kit generate --custom --name catalog_<what>` and paste the rows in. The catalogue migration test fails until the database matches the file.
4. For a verified product, prepare its onboarding record (format: `docs/onboarding/example-products.synthetic.json`) and run `npm run catalogue:validate -- products.json --evidence evidence.json` until it is READY.
5. After deploying and migrating, set its stock in the stockroom and its price in the owner console if it differs from the list price.
6. `npm run db:check-catalog` confirms the file and the database agree.

## Change the delivery fee or free-delivery threshold

Edit `FREE_SHIPPING_THRESHOLD_PAISE` and `STANDARD_SHIPPING_PAISE` in `src/lib/money.ts`. Every banner, the bag's progress bar, checkout, the shipping policy and the FAQ read them from there. A test (`content-claims.test.ts`) fails if a delivery figure is written anywhere else.

## Add a setting

1. Read it with `process.env.NAME` in the one module that needs it. Never in a client component unless it starts with `NEXT_PUBLIC_` and is not secret.
2. Document it in `.env.example` with a comment saying what it is for and where the value comes from.
3. If a deployment would break without it, add a check to `scripts/check-env.mjs` (it reports shapes and lengths, never values).
4. Appendix C of this manual picks it up automatically on the next rebuild.

## Change the database schema

1. Edit `src/db/schema.ts`. Prefer adding tables and nullable columns over changing or dropping existing ones.
2. `npx drizzle-kit generate --name <what>` writes the next numbered SQL file in `drizzle/`. Read it: it should contain only the intended change.
3. Tests build their databases from the migrations, so a schema the migrations do not create fails the tests.
4. Rehearse on a Neon branch (`DATABASE_URL=<branch> npm run db:migrate`), then ask the owner before applying to production.
5. If the change is destructive, write a data check first and a rollback script in `docs/runbooks/`.

## Add an API route safely

Every route that changes data follows the same order, which is what keeps the API safe. A minimal skeleton:

```
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await auth().catch(() => null);           // if it needs a person
  if (!session?.user?.id) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const limited = await limit([{ policy: 'myPolicy', subject: { kind: 'user', id: session.user.id } }]);
  if (!limited.allowed) return limitResponse(limited);
  const read = await readBoundedJson(request, BODY_LIMITS.myRoute);   // size cap
  if (!read.ok) return read.response;
  const parsed = schema.strict().safeParse(read.json);                 // strict zod schema
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  // ... scope every query to session.user.id ...
  return privateJson({ ok: true });                                     // private, no-store
}
```

Then:

- Add the body limit to `BODY_LIMITS` in `src/lib/request-body.ts` and the policy to `DEFAULT_POLICIES` in `src/lib/rate-limit.ts` (with `onFailure: 'closed'` unless it is a cheap read).
- If the address is private, make sure `src/lib/cache-policy.ts` marks it so (a test checks every private path).
- Write a route-level test with `createMigratedDb()` and a foreign-owner case that must get 404.

Webhooks are the exception to the origin check: verify a signature or a shared token in constant time instead, refuse everything when the secret is not configured, and record events by the provider's id so repeats change nothing.

## Add an owner-only action

In a `'use server'` file under `src/app/admin/`:

1. First line: `if (!(await isAdmin())) return;` (or check `getStaffSession()` and its role). Never rely on the page or middleware.
2. Validate the form fields; never trust a status or amount from the form. Compare-and-set on the state you read, so two staff pressing different buttons cannot both win.
3. `recordAudit({ actor, actorRole, action, entityType, entityId, before, after })`.
4. `revalidatePath(...)` for every screen that shows the changed data, and `revalidateProduct(id)` if the storefront shows it.

## Add an event and a reaction to it

1. Add the name to `EventName` in `src/lib/events.ts`.
2. Emit it with `emitEvent(name, subjectId, { orderId, orderNumber }, tx)` **inside the transaction** that makes the change.
3. Handle it in a consumer in `src/lib/event-consumers.ts`: re-read the current state, act, and throw if the action failed and should be retried (up to 5 attempts, then visible in System).
4. If it should happen promptly, schedule the drain after the response (`after(...)`, as the payment service does).

## Change a rate limit without deploying

Set `RATE_LIMIT_OVERRIDES` in Vercel to JSON, for example:

```
{"chatSpendDay":{"limit":100,"ipLimit":100},"checkout":{"limit":20}}
```

Invalid values are ignored and reported; unknown policy names are ignored. Redeploy to apply.

## Change the AI chat's behaviour

- **What it says:** `SYSTEM_PROMPT` in `src/modules/skin-chat/chat.ts`. Keep it free of dates, random values or per-request data, so it stays identical between requests and the provider can cache it. The tests check the safety phrases are present.
- **Urgent signs:** the `URGENT` list in `src/modules/skin-chat/red-flags.ts`. Add a phrase, then a test that it is flagged and a test that a harmless sentence is not.
- **Cost:** `USD_PER_MTOK` and `INR_PER_USD` in `chat.ts` must be updated if the model or its prices change; `MAX_REPLY_TOKENS` and `MAX_HISTORY_MESSAGES` bound each message.
- **Model:** `CHAT_MODEL`. Check the new model's prices and parameters before switching.

## Add a CMS content type

Add a Zod schema to `CONTENT_TYPES` in `src/modules/cms/content-types.ts` with length limits on every field, add a form in the content editor, and read it through `content-read.ts` with a cache key. Publishing already runs the claim rules and invalidates the cache.

## Write a test

- **Pure logic** (pricing, risk scoring, planning): plain unit tests, no database.
- **Anything touching the database:** `const { client, db } = await createMigratedDb();` then `vi.mock('@/db', () => ({ db, isDatabaseConfigured: () => true }))`. This runs the real migrations in PGlite.
- **Outside services:** pass a fake `fetch` or client (see the Shiprocket and Cashfree tests). Never call a real provider from a test.
- **Then break the code on purpose** and check the test fails. A test that cannot fail protects nothing.

## Rebuild this manual

The source is in `docs/manual/source/`. After code changes, run `node extract.mjs` (re-reads tables, routes, settings, migrations and tests) and `node build.js ../Avyora-Technical-Manual.docx`, then update the contents list in Word. Add new chapters as Markdown files; a heading written `# Title {#label}` is numbered automatically, and the label written inside double square brackets anywhere in the text becomes its chapter number.

