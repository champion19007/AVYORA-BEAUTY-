# Decision log {#decisions}

The important choices, why they were made, and when to revisit them. A future developer should read this before changing any of them.

## Money and orders

### Store money in whole paise

**Decision.** Every amount is an integer number of paise. Rupees appear only in forms and outside APIs.

**Why.** Decimal rupees in floating point drift (0.1 + 0.2 is not 0.3). A total that is one paisa off fails the payment amount check and leaves a paid order unconfirmed. Integers cannot drift.

**Revisit.** Never.

### Never accept a price from the browser

**Decision.** The browser sends what was chosen; the server prices it. The price the customer saw is sent only so a change can be detected and refused.

**Why.** Trusting a client price lets anyone buy a serum for ₹1 by editing a request.

**Revisit.** Never.

### One transaction for stock, order and event

**Decision.** Reserving stock, writing the order and its lines, and recording the event happen in one database transaction.

**Why.** If any part fails, nothing exists. An order can never exist for goods that were not available, and an event can never announce an order that rolled back.

**Revisit.** Only if orders move to a separate service, which would need a saga pattern instead.

### Refuse a changed price rather than charge it

**Decision.** If a price changed between showing and ordering, the order is refused before reserving anything, and the new price is shown.

**Why.** Charging a price the customer never agreed to is a complaint and possibly a chargeback; refusing costs one click.

### Announce online orders only when paid

**Decision (12 October 2026).** Cash-on-delivery orders are announced when placed; online orders when paid.

**Why.** Customers who backed out of the payment screen were receiving "order confirmed", and the owner was alerted about sales that never happened.

### Count COD as paid on delivery

**Decision (21 October 2026).** A delivered cash-on-delivery order records a captured payment through the normal state machine.

**Why.** Revenue counts paid orders only, so COD sales were invisible in the owner's figures. Recording through the state machine keeps one path for all money.

**Revisit.** If COD remittance reports from Shiprocket are later imported, they could confirm the amount actually received.

## Payments

### Cashfree instead of Razorpay

**Decision (9 October 2026).** Online payments moved to Cashfree. Razorpay code remains only to settle older orders.

**Why.** The owner's choice of provider. The payment state machine, event recording and reconciliation were already provider-neutral, so only the provider client and routes changed.

### The webhook is authoritative, the browser is not

**Decision.** The return page asks Cashfree; the signed webhook confirms; reconciliation catches anything missed.

**Why.** A closed tab or dropped connection must never decide whether money was taken.

### "Unknown" is its own answer

**Decision.** Reconciliation answers paid, not paid, no session, or unknown. Only "not paid" and "no session" allow stock to be released.

**Why.** An early version cancelled orders after 30 minutes without asking the provider, while the provider was still retrying a successful payment's webhook. A timeout is not a failure.

## Data and infrastructure

### Postgres for everything durable, including rate limits and the job queue

**Decision.** No separate queue service, no Redis required. Rate limits, jobs, events and caches of record all live in Postgres.

**Why.** One system to run, back up and reason about. At this shop's volume a table is not the bottleneck. Serverless memory is neither shared nor durable, so an in-memory rate limit is no limit at all.

**Revisit.** When rate-limit writes measurably slow the database (tens of thousands of customers a day): move hot policies to Redis. The change is confined to `src/lib/rate-limit.ts`.

### Fail closed for costly or sensitive actions

**Decision.** Sign-in, checkout, payments, the AI chat and staff actions refuse when their rate limiter cannot be reached. Cheap cached reads stay open.

**Why.** A limiter that silently switches off during a database hiccup removes protection exactly when something is wrong.

### Display may fall back; checkout may not

**Decision (21 October 2026).** If the database is unreachable, shop pages show list prices and "out of stock"; checkout fails.

**Why.** A whole storefront going down because one stock read failed turned a short outage into a site outage. But a fallback price must never become a charge.

### Pre-built pages and a CSP without nonces

**Decision.** Public pages are pre-built, so the CSP allows inline scripts instead of per-request nonces.

**Why.** Nonces must be stamped into each response, which pre-built pages cannot do; trying it blanked the site. Pre-building is what makes the shop fast and cheap to serve.

**Revisit.** If most pages become per-request.

### Additive migrations, applied by hand

**Decision.** Schema changes add rather than alter where possible, are rehearsed on a Neon branch, and are applied to production only with the owner's approval.

**Why.** Code can then be rolled back without a schema rollback, and no surprise reaches the live database.

## Personalisation and content

### Unknown is never "no"

**Decision.** Any unanswered safety question (pregnancy, allergies, age) is unknown, and unknown blocks elective treatments.

**Why.** The original quiz mapped "prefer not to say" on pregnancy to "no", which made retinoids eligible.

### Safety before ranking

**Decision.** Excluded products never reach the scoring step.

**Why.** A weighted score can always be overpowered by a large enough weight. An exclusion cannot.

### No invented knowledge

**Decision.** No direction, caution, percentage, review or score is shown unless it exists and was approved.

**Why.** Skincare advice that sounds authoritative but was never reviewed is a safety and legal risk. The system says "being reviewed" instead.

### Ask Avyora without an AI model

**Decision.** The on-device assistant uses lookups over the approved knowledge release, not a language model.

**Why.** Free to run, instant, private (questions never leave the device), and it cannot make anything up.

### The AI skin chat on Claude Haiku 5.5, metered per person

**Decision (12 and 21 October 2026).** The chat uses the cheapest current Claude model, requires sign-in, and charges each reply's real cost against ₹0.50 per person per day.

**Why.** The owner's budget was about ₹1 for 10 to 15 messages. Self-hosting an open model on a cloud GPU costs around ₹80 to ₹90 an hour whether used or not, which is far more at this volume. Metering real usage (rather than counting messages) matches the bill exactly; sign-in makes the budget per person rather than per network address.

**Revisit.** If volume grows to thousands of chats a day, compare against batch pricing or a self-hosted model.

### Urgent symptoms detected by code, not the model

**Decision.** A fixed list of urgent signs is matched on the server, and the doctor notice is sent before the model's reply.

**Why.** It works even if the model misreads a message, and a test can prove it.

## Operations

### Shiprocket as the courier aggregator

**Decision (21 October 2026).** Deliveries are booked through Shiprocket; its tracking webhooks move orders.

**Why.** The owner's choice. One integration reaches many couriers, prints labels and reports tracking, which removes a button press per leg for the stockroom.

### Courier updates only move forward

**Decision.** A tracking update can advance an order but never move it back, and a return is accepted only after the parcel left.

**Why.** Webhooks arrive late and out of order. A delayed "in transit" must not undo "delivered".

### The autopilot raises requests, it does not buy

**Decision.** The morning autopilot creates restock requests and a summary; the owner approves.

**Why.** Buying commits money to a supplier the system knows nothing about. The useful part, never running out unnoticed, needs no money decision.

### A second step for the owner only

**Decision (21 October 2026).** The owner signs in with a password and an emailed code; the manager with a password.

**Why.** The owner console controls prices and shows every customer; the stockroom does not. An emergency switch (`OWNER_TWO_STEP=off`) avoids a lock-out if email fails.
