::part Running the shop
The screens staff use every day, and the automation that does the rest: deliveries through Shiprocket, stock that reorders itself, and content that cannot publish a false claim.

# The stockroom {#stockroom}

The stockroom console (`/manager`) is for the person who packs parcels. It is open to both staff roles, so the owner can pack when the manager is away. It has four screens: **Dispatch**, **Stock**, **Requests** and **Help**.

## Dispatch

Orders are listed **oldest first**, because the person who has waited longest should be served first. Delivered, cancelled, refunded and returned orders leave the queue. Each card shows:

- the order number and date, and what the customer currently sees ("Customer sees: Being prepared");
- what to pack: quantity, product and size for every line;
- who it goes to: name, city, state, PIN code and phone;
- the payment line: "Cash on delivery: collect payment at the door", or in red, "Not paid. Do not send; check with the owner";
- any hold, in red, with the reason;
- once booked: the courier, the tracking number (linked to Shiprocket's tracking page), the latest courier status, and **Print the shipping label**.

## Sending an order

1. Pick the items under "Pack" and box them.
2. Press **Mark packed**. The customer now sees "Being prepared".
3. Press **Book courier**. Shiprocket chooses the courier, assigns the tracking number, schedules the pickup and produces the label. Any problem (for example a PIN code no courier reaches) is shown on the card, and the order stays packed for another try.
4. **Print the label**, stick it on the box, and hand it over at pickup.
5. From here the courier's own updates move the order: on its way, out for delivery, delivered. Nothing more to press.

If a parcel goes another way (hand delivery, or Shiprocket not set up), the manual buttons remain: **Hand to courier**, **Out for delivery**, **Mark delivered**. Marking a cash-on-delivery order delivered records the cash as collected.

## Holds

| Card says | Meaning | What to do |
| --- | --- | --- |
| On hold: the owner needs to decide | A payment or courier problem needs the owner | Do not pack. It moves on its own once cleared |
| On hold: failed an automatic check | A risky cash-on-delivery order | Do not pack. The owner confirms with the customer |
| Risk check still running | Scored a moment after placing | Wait and refresh |
| Not paid. Do not send | Online payment never completed | Leave it. The morning sweep cancels it if never paid |

The manager cannot cancel an order. Cancelling involves refunds and telling the customer, which is the owner's decision.

## Stock

The Stock screen lists every SKU, counted or not, with the count on the shelf.

- **Adding or removing.** Type the change, not the new total: `+24` when putting 24 on the shelf, `-2` when taking two off (damaged, samples), then **Apply**. The database does the arithmetic, so two people counting at once cannot overwrite each other.
- **Asking for more.** Type a quantity under "Need more" and press **Request**. One open request per item; the line then says "Already requested".

Anything showing "Out of stock" cannot be bought by customers, including items nobody has counted.

## Help

The Help screen (`/manager/help`, added 21 October 2026) answers the everyday jobs step by step: sending an order, holds, unpaid orders, new stock, low stock, returned parcels and customer calls. It is written for the days the owner is not there to ask.

# The owner console {#owner}

The owner console (`/admin`) is for the owner only. Every action on it is checked again on the server, so a manager who guessed an address would still be refused.

## Signing in

At `/admin-login`, the owner enters the username and password, then a six-digit code emailed to `OWNER_EMAIL`. The code expires in 10 minutes and allows five guesses. Sessions last 8 hours. Setting `OWNER_TWO_STEP=off` removes the second step, for use only if email is broken.

## Screens

| Screen | What it is for |
| --- | --- |
| Overview | Money taken, orders awaiting payment, paid orders not yet packed, low and out-of-stock warnings |
| Orders | Every order; open one for its lines, payment history, risk panel, attention panel and status controls |
| Inventory | Stock levels and backorder switches. Changing a count asks twice, because the stockroom's physical count should win |
| Pricing | Price and offer per SKU |
| Analytics | Units and revenue per product over 30 days, days of stock cover, a 7-day estimate |
| Requests | Restock requests (Ordered or Decline), support messages (Mark answered), reviews to moderate (Publish or Reject) |
| Content | The CMS (Chapter [[cms]]) |
| Knowledge | Validate, publish, roll back and revoke knowledge releases |
| Catalogue | Preview catalogue records before onboarding |
| System | Job queue depth, failed and dead jobs and event deliveries with Replay, pending and failed scans, photos past their deletion time |

## Prices and offers

In **Pricing**, find the product and size and enter rupees:

- **Price**: the normal price.
- **Offer**: the discounted price, which must be below the normal price.
- **Label**: what customers see on the badge, for example "Festive 20% off".
- **Ends**: leave blank to run until stopped. To end an offer, clear the Offer box and save.

Each price row has a version. If two people edit the same price, the second save is refused with "changed since you opened it", rather than silently overwriting. The storefront, the bag and checkout all use the same pricing rule, so the price shown is the price charged.

## Revenue

Revenue counts **paid orders only**. Online orders count when paid; cash-on-delivery orders count when delivered (since 21 October 2026). Cancelled, refunded and returned orders are excluded.

## Orders held by the cash-on-delivery risk check

A fake COD order is expensive: you pay to pick, pack, send and get it back, and only find out at the end. Every COD order is scored a moment after it is placed (`src/lib/cod-risk.ts`). Each signal has a weight:

| Signal | Weight |
| --- | --- |
| Address with no house or flat number | 35 |
| Name or address looks like filler text | 50 |
| 3 or more COD orders from this customer (email or phone) in 24 hours | 30, plus 15 for each order beyond 3, up to 70 |
| Earlier COD orders came back undelivered | Up to 80, by the share returned |
| Large first order with no purchase history | 25 |

The score is **the strongest signal plus 40% of the others**, capped at 100. It is not a plain sum: extra signals count for less than the strongest one. For example, filler text (50) plus a missing house number (35) scores 50 + 14 = 64, a hold rather than a refusal.

| Score | Result |
| --- | --- |
| Below 40 | Approved: goes straight to dispatch |
| 40 or more | Held for the owner's review |
| 70 or more, with at least two signals agreeing | Refused automatically: the order is cancelled and its stock returned |

A single signal, however strong, can hold an order but never refuse it. A wrong hold costs one phone call and a few hours; a wrong refusal loses a real customer, so the rules treat the two mistakes differently.

Open the order in Orders. The panel shows the score and the reasons, with two choices:

- **Release for dispatch.** The hold clears and the order appears normally for the stockroom.
- **Cancel and restock.** The order is cancelled and the stock goes back on the shelf.

> **Phone the customer before cancelling.** None of the reasons are proof. An address without a house number is common in older localities and villages; a large first order is what a generous customer looks like. If you find yourself releasing nearly everything, the thresholds (`REVIEW_AT` 40 and `REJECT_AT` 70 in `src/lib/cod-risk.ts`) are too strict and should be tuned against real orders.

## Orders that need attention

An order with an attention reason is held from dispatch until the owner clears it with a note saying what was done. The reasons are:

- paid after its stock was sold to someone else;
- paid after it was cancelled;
- lost, damaged, destroyed or untraceable according to the courier;
- undelivered;
- returned to us while prepaid, so a refund is due.

The note is recorded in the audit log.

## The audit log

Every sensitive change writes a row to `audit_logs` with who did it, their role, the before and after values, and the request id. That covers prices, stock, order status, risk decisions, attention notes, courier bookings, courier status changes (recorded as "courier"), publishing, knowledge releases, support answers and review moderation. "I did not touch it" can always be checked.

# Reading the numbers {#analytics}

What each figure in the owner console means, how it is calculated, and how far to trust it.

## What counts as a sale

Every sales figure uses one rule, shared by the analytics screen and the morning stock autopilot (`realSale` in `src/lib/analytics.ts`):

| Order | Counts? |
| --- | --- |
| Paid online | Yes |
| Cash on delivery, placed and not cancelled | Yes (as demand), even before delivery |
| Online, abandoned at the payment screen | No |
| Cancelled (by the owner, the risk check or the sweep) | No |
| Refunded | No |
| Returned to us by the courier | No |

> **Fixed on 21 October 2026.** The analytics screen used to count returned parcels and online orders abandoned at payment as sales, which inflated units, revenue and the reorder estimate. Both now use the same rule.

## The overview

| Figure | Meaning |
| --- | --- |
| Money taken | Total of orders whose payment status is **paid**: online payments, plus cash-on-delivery orders once delivered |
| Awaiting payment | Orders still unpaid: open online attempts and undelivered cash-on-delivery orders |
| Paid, not packed | Paid orders the stockroom has not marked packed yet: the backlog to watch |
| Low or out of stock | SKUs at or below their low-stock level, and those at zero |

## Analytics (last 30 days)

| Column | How it is calculated |
| --- | --- |
| Units sold | Sum of quantities on real sales of that SKU in the window |
| Revenue | Sum of the line totals (after offers) on those sales, in rupees |
| Daily rate | Units sold ÷ 30 |
| Cover | Stock on hand ÷ daily rate, in days. Blank when the product is not selling (it would otherwise say "forever") or has no count |
| Next 7 days | Average daily revenue over the more recent half of the window × 7 |
| Change | Recent half's daily average against the earlier half's, as a percentage. Blank when the earlier half sold nothing |
| Sample | How many days the estimate is based on |

Rows are ordered by units sold, not revenue, because the question the screen answers is "what do I need to reorder", which depends on how many left the shelf.

## How much to trust the estimate

The forecast is deliberately simple: a moving average, not a prediction model. With only a few weeks of history, anything cleverer draws a confident line through noise, and stock bought against a made-up trend is real money lost. It assumes the next week looks like the last, which is wrong during a festival, a launch, a viral post or after a bad review. The sample size is printed next to it as its own warning. Treat it as a prompt to look, not an instruction to buy.

## The morning autopilot's numbers

The autopilot uses a 28-day window rather than 30 and plans for a 7-day supplier lead time plus 30 days of cover (Chapter [[autopilot]]). Its "days left" is stock ÷ daily rate, rounded down.

## Comparing with the payment provider

Revenue in the owner console should match Cashfree's settled payments (online) plus cash collected through Shiprocket's COD remittances, less refunds. A small difference at the edges of a period is normal (a payment made at 23:59 may settle the next day). A larger one usually means a refund made in Cashfree without the order being cancelled here, or a parcel delivered without the courier's update arriving: both show up as individual orders to check.

## Where the figures come from

These are the heaviest reads in the system (every order in the window), and none needs the last few seconds of data, so they read with "eventual" consistency: from a read replica when one is configured, otherwise from the main database.

# Deliveries with Shiprocket {#shiprocket}

Shiprocket is a courier aggregator: it chooses among Delhivery, Blue Dart, Xpressbees and others by the rules set in the Shiprocket dashboard, books the pickup and produces the shipping label. Avyora's integration was added on 21 October 2026, built from Shiprocket's published API (apidocs.shiprocket.in).

## What happens when the manager presses Book courier

The four calls are made in `src/modules/shipping/shiprocket.ts`:

| Step | Shiprocket call | Result |
| --- | --- | --- |
| 1. Sign in | `POST /auth/login` | A token, kept for 9 of its 10 days |
| 2. Create the order | `POST /orders/create/adhoc` | Shiprocket order id and shipment id |
| 3. Assign the courier | `POST /courier/assign/awb` | The tracking number (AWB) and courier name |
| 4. Schedule pickup | `POST /courier/generate/pickup` | Best effort; can be redone in the Shiprocket panel |
| 5. Get the label | `POST /courier/generate/label` | A label PDF link; best effort, also downloadable from the panel |

Steps 2 and 3 must succeed; if either fails, the order stays packed and can be booked again. A booking is "claimed" in the database before it starts, so a double click cannot book a parcel twice. The parcel is sent as one standard size (0.5 kg, 15 × 12 × 8 cm by default, adjustable in settings), prepaid or COD, with the order total in rupees, the customer's 10-digit mobile, and the order date in India time.

Only packed orders that are not on hold can be booked: paid online, or cash on delivery that passed the risk check.

## Tracking updates

Shiprocket posts every tracking event to `https://YOUR-DOMAIN/api/webhooks/courier`. (Shiprocket refuses webhook addresses containing "shiprocket", "sr" or "kr", hence "courier".) Each request must carry the security token in the `x-api-key` header; it is compared in constant time, and with no token configured the address refuses everything, because an open one would let anyone mark a parcel delivered.

| Shiprocket status | Order becomes | Also |
| --- | --- | --- |
| Picked up, shipped, in transit, reached destination, delayed, at warehouse, handed to courier | Shipped ("On its way") | The customer gets the "on its way" email with tracking |
| Out for delivery | Out for delivery | |
| Delivered | Delivered | Cash on delivery is recorded as paid |
| Returned to origin and delivered back to us | Returned | Stock is put back on the shelf; a prepaid order is flagged for a refund |
| Lost, damaged, destroyed, undelivered, untraceable, return initiated | Unchanged | The owner is alerted with the reason |
| Label generated, manifest, pickup queued and others | Unchanged | Shown on the dispatch card |

Updates only move an order **forward**. A late "in transit" cannot pull a delivered order back, two updates racing cannot both move it, and a repeated "returned" cannot restock twice. Shiprocket expects a 200 answer for every delivery, so a processing failure is logged and answered 200; the next update for the same parcel carries the newer status anyway.

## Setting it up

1. Create a Shiprocket account and add the pickup address. Note its **nickname** exactly as saved.
2. In Shiprocket, go to Settings → API → **Add New API User**. Use an email different from the main login, and copy the password immediately; it is shown once.
3. In Vercel, set `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` and `SHIPROCKET_PICKUP_LOCATION`. Optionally set the parcel size: `SHIPROCKET_PARCEL_WEIGHT_KG`, `_LENGTH_CM`, `_BREADTH_CM`, `_HEIGHT_CM`.
4. Generate a long random token (`openssl rand -hex 32`) and set it as `SHIPROCKET_WEBHOOK_TOKEN`.
5. In Shiprocket, go to Settings → API → **Webhooks**. Add `https://YOUR-DOMAIN/api/webhooks/courier`, paste the same token as the security token, and enable it.
6. Apply database migration 0022 (adds `awb` and `shipment` to orders) to production, with approval.
7. Book one real parcel and watch it move through the statuses.

> **Note.** Booking costs money per shipment through your Shiprocket wallet. The integration was tested against a fake Shiprocket that follows the documented API (16 tests), not against a live account.

# Stock autopilot {#autopilot}

Every morning at 08:45 India time, as part of the daily sweep, `runStockAutopilot` in `src/modules/inventory/autopilot.ts` looks after stock so the owner does not have to.

## The rule

For each SKU, from real sales over the last **28 days**:

| Quantity | Calculation |
| --- | --- |
| Daily rate | Units sold in 28 days ÷ 28 |
| Reorder point | The larger of the SKU's low-stock level and (daily rate × 7 days of supplier lead time) |
| Days left | Stock on hand ÷ daily rate |
| Quantity to request | Enough for the 7-day lead time plus 30 days of sales, and at least twice the low-stock level, minus what is on hand |

"Real sales" means orders paid online, or cash on delivery, that were not cancelled, refunded or returned. Abandoned online orders are not demand. Backorder SKUs are skipped.

**Example.** A toner that sold 56 units in four weeks sells 2 a day. Its reorder point is 14. With 12 left (6 days), the autopilot asks for 74 − 12 = 62.

## What it does

1. Raises a restock request for every SKU at or below its reorder point that does not already have an open one, signed "autopilot", with the reason in words: "Raised automatically. Sells about 2.0 a day, so about 6 days left. Enough for 7 days' delivery plus 30 days of sales."
2. Sends the owner one morning message: WhatsApp (short) and email (the full list). For example: "Avyora, last 24 hours: 3 orders, ₹2,847. Running low: 2 items. 2 new restock requests raised for you to approve."

The owner still decides what is actually bought: closing a request as **Ordered** means "I have ordered it from the supplier". The system's job is to make sure nothing runs dry unnoticed.

## Tuning

`LEAD_DAYS` (7), `COVER_DAYS` (30) and `SALES_WINDOW_DAYS` (28) are constants at the top of the file. Each SKU's low-stock level (default 5) is the floor. A festival, a launch or a bad review breaks the "next month looks like last month" assumption, so treat requests as prompts to look, not instructions to buy.

> **Not built, on purpose.** Automatic approval and supplier ordering. Approving means money and a supplier relationship the system does not know about; it needs supplier details and a spending rule from the owner first.

# Content and the CMS {#cms}

The CMS (`/admin/content`) manages the words on the site that are not part of the catalogue file.

| Content type | Fields |
| --- | --- |
| Product copy | Tagline (up to 160 characters), description (up to 2,000), how to use (up to 1,500), up to 6 highlights |
| Article (journal) | Title, excerpt, body (up to 20,000 characters), hero image |

## Drafts, publishing and revisions

- **Save draft** stores a revision; nothing changes on the site.
- **Publish** makes it live. It first runs the content rules (Chapter [[catalogue]]) and refuses a draft containing an unsupported offer, an absolute claim or a placeholder: "Not published: … Edit the draft and try again." Publishing invalidates the cache, so the page updates at once.
- **Unpublish** takes it down; **Restore** brings back any earlier revision as a new draft.
- Two editors on one document: the second save is refused with a "changed since you opened it" message instead of overwriting.
- Publishing is rate limited (5 a minute per staff member) and audited.

## Media

Images are uploaded to S3-compatible object storage when one is configured (the `STORAGE_S3_*` settings and `STORAGE_PUBLIC_BASE_URL`). Without it, uploads are switched off and articles use no hero image. The CSP allows images from the configured media domain only.

## Product copy and directions

Product pages show approved directions first, then the CMS "how to use" text, otherwise "Directions specific to this product are being reviewed". Generic advice such as "use twice daily" is never invented.
