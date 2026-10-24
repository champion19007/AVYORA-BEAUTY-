::part Customer features
Everything a shopper touches: the catalogue, the bag and checkout, payments, orders and tracking, accounts, the routine finder, Ask Avyora and the AI skin chat.

# Customer journeys {#journeys}

Before the feature-by-feature chapters, this chapter follows real customers through the shop, so the pieces can be seen working together. Each journey says what the customer sees and what the system does behind it.

## Journey 1. A first visit that ends in a cash-on-delivery order

**Who.** Meera, 27, oily skin with occasional breakouts. She has never bought from Avyora and does not want to create an account.

1. **She lands on the home page** from a search result. The page arrives as pre-built HTML from Vercel's edge in a few tens of milliseconds; no server or database work happens for her visit. She sees the hero ("Skincare built around a simple routine"), four best sellers with current prices, and the three essentials at their lowest prices.
2. **She opens Collections** and filters by "Acne Control". Filtering happens in her browser; the product grid was already in the page.
3. **She opens the LHA sebum-control product.** She picks a size and quantity 2. The quantity selector stops at the number in stock, or 10, whichever is lower. Directions show "being reviewed", because none are approved yet; nothing generic is invented.
4. **She adds it to the bag.** The bag asks the server for a current price quote for that one SKU and shows the line priced for that size, times two. Below ₹1,199 it shows "Add ₹… for free delivery".
5. **She goes to checkout.** The page reads prices and stock fresh from the database. She enters her email and address. Because SMS is configured, she is sent a six-digit code to prove her mobile number. She chooses **Cash on delivery**.
6. **She presses Place order.** In one transaction the server prices her bag, reserves two units, saves her address, order and lines, and writes an `order.placed` event. Her page moves straight to the order confirmation.
7. **Straight after,** the risk check scores her order (no warning signs: approved), she receives a confirmation email with a private link to her order, and the owner gets an email and a WhatsApp line: "New order AVY-7KQ2MX — ₹798 (COD). 2 items to Pune."
8. **In the stockroom,** her order appears at the bottom of the dispatch queue (oldest first). The manager packs it, presses **Mark packed**, then **Book courier**; Shiprocket assigns Delhivery and a tracking number. The label is printed.
9. **When the courier picks it up,** Shiprocket's update moves her order to "On its way", and she receives an email with the tracking link and "Cash on delivery: please keep ₹798 ready."
10. **On delivery,** the courier's update marks the order delivered and records the ₹798 as paid. It now counts in the owner's revenue.

## Journey 2. Paying online, then changing her mind

**Who.** Ritu, a returning customer, signed in with Google.

1. Her bag, saved on the server, follows her from her phone to her laptop when she signs in.
2. At checkout she chooses **Pay online** and presses Pay. The server creates the order (reserving stock) and a Cashfree payment session, and the browser remembers the attempt.
3. On Cashfree's page she has second thoughts and presses Back.
4. Back on checkout, the page finds the remembered attempt and asks the server to cancel it. The server asks Cashfree to terminate the payment session; Cashfree confirms it is closed; the order is cancelled and its stock returned.
5. Ritu sees: "Nothing was ordered and you have not been charged." The Pay button works again, with a fresh attempt.
6. **Nobody was told about an order that did not happen:** no confirmation email, no owner alert. Online orders are announced only when paid.
7. Later she pays for real. Cashfree's signed webhook confirms the payment; the amount matches the order total exactly; the order becomes paid; now the confirmation and the owner alert go out.

## Journey 3. Building a routine

**Who.** Arjun, 34, sensitive skin, a budget of ₹1,500, already owns a cleanser he likes.

1. He opens the **routine finder** and answers the questions. On pregnancy he can skip; on reactivity he chooses "very reactive"; under owned products he adds his cleanser.
2. The plan is computed **on his device**, instantly, by the same engine the server uses.
3. Because he is very reactive, he gets gentle essentials only: his own cleanser, a moisturiser and a sunscreen. No actives, no exfoliation. "Not included yet" lists the treatments left out, each with its reason.
4. The week is shown as a real seven-day table, morning and evening. The total of what he would need to buy is within ₹1,500.
5. He chooses **Allow saving and save**. That records his permission (routine saving, policy version `routine-saving-v1`) and saves the routine to his account for 180 days. The server recomputes it from his answers; the browser's result is never trusted.
6. A week later, his account page asks "How is week 1 going?" with three short choices.

## Journey 4. A question at midnight

**Who.** Sana, signed in, worried about a new rash.

1. She opens **Talk about your skin** and reads the notice: an AI, not a doctor; messages go to Anthropic to get a reply; nothing is saved.
2. She writes that her lips are swollen after a new serum. Before the AI answers, the server's own check spots "swollen … lips" and sends: "Please see a doctor or dermatologist soon about swelling of the face, lips, eyes or throat. If it is severe or getting worse quickly, or you have trouble breathing, go to emergency care now."
3. The AI's reply follows, without product suggestions, as its instructions require for urgent signs.
4. The next day she asks about oily T-zone and dry cheeks. The AI suggests the matching Avyora gel moisturiser and explains which concern it is meant for. Each reply costs a few paise from her ₹0.50 daily budget.

## Journey 5. Tracking without an account

**Who.** A guest who lost the confirmation email.

1. She opens **Track order** and enters her order number and email.
2. If both match, she sees the status in plain words and a coarse location. If either is wrong, the answer is the same "we could not find that order", so the page cannot be used to discover orders.
3. Twenty tries a minute is the most anyone gets.

## Journey 6. A parcel that comes back

1. A COD parcel is refused at the door. The courier marks it undelivered: the order keeps "On its way" and the owner is alerted: "The courier could not deliver this parcel. Call the customer before it goes back."
2. The owner calls; no answer. The parcel returns.
3. When Shiprocket reports it delivered back to the seller, the order becomes **returned** and the stock goes back on the shelf, exactly once.
4. The next time this customer orders cash on delivery, the risk check sees an earlier COD order that came back, and weighs it.

# Catalogue and storefront {#catalogue}

## The catalogue

The range is 27 products in 30 sizes (SKUs), defined in `src/data/mock-data.ts` and mirrored in the database tables `catalog_products` and `catalog_variants`. Every size has a stable id built from the product and size, for example `retinol-90ml`, so "30ml", "30 ml" and "30 ML" can never become three different SKUs.

What lives where:

| Information | Source of truth | Edited by |
| --- | --- | --- |
| Product identity, name, category, sizes, list price | The catalogue file | A developer, through a reviewed change |
| Prices and offers | `product_pricing` (overrides the list price) | The owner, in Pricing |
| Stock | `inventory` | The manager (and the owner, with a double confirmation) |
| Product copy and directions | CMS documents, then approved directions | The owner, in Content |
| Ingredients, formulations, cautions | Knowledge records and releases | Reviewed data, published by the owner |

## Catalogue mode

`NEXT_PUBLIC_CATALOGUE_MODE` decides what the shop is allowed to sell:

| Mode | Behaviour |
| --- | --- |
| `sample` (default) | Products are labelled samples, a notice shows on shopping pages, and a production build refuses orders with "This is a preview shop: the products shown are samples and cannot be ordered yet." |
| `verified` | Only onboarded products with verified records are shown and sold |

`ALLOW_SAMPLE_ORDERS=1` lets a staging deployment take sample orders for sandbox testing. It must never be set on the real shop.

## Shop pages

- **Home** (`/`): the hero ("Skincare built around a simple routine"), best sellers with size choice and quick add, what Avyora does, the three essentials at their lowest current prices, an FAQ and a support form.
- **Collections** (`/collections`): every product with filters by category and concern, sort by price, and search (`?q=`). The server-rendered page contains the full grid so search engines and first paint see real products; filters apply in the browser.
- **Product pages** (`/products/[slug]`): sizes with their own prices and stock, quantity (capped at what is available and at 10 per SKU), ingredients, directions (only approved ones; otherwise "being reviewed"), verified-purchase reviews, related products that pass the ingredient-conflict check, and product structured data for search engines.
- **Compare** (`/compare`): side by side, with unit prices and which fields are verified.
- **Wishlist** (`/wishlist`): saved in the browser for guests, in the database for signed-in customers.

## Stock labels

| Stock | Label |
| --- | --- |
| Above the SKU's low-stock level | In stock |
| At or below it | Only a few left |
| Zero, or never counted | Out of stock (cannot be added) |
| Backorder allowed | Available |

A SKU nobody has counted cannot be sold. "We have never counted this" and "we have none" are the same thing from the customer's side, so a fresh deployment sells nothing until stock is entered (`npm run db:seed-inventory <n>` or the stockroom screen).

## Honest content rules

`src/lib/content-claims.ts` holds rules that run in the test suite and when CMS content is published. They block:

- offers the checkout does not apply (for example "Buy 2, Get 3rd Free", which was removed for that reason);
- absolute claims such as "zero irritation", "cures", "100% safe", "anti-wrinkle" or "shrinks pores";
- placeholder text and dummy phone numbers;
- delivery figures written anywhere except `src/lib/money.ts`.

`npm run check:launch` lists every remaining launch blocker (unconfirmed business details, missing directions) and exits with an error until there are none.

# Bag and checkout {#checkout}

## The bag

A bag line is `{productId, size, quantity}` and never a copy of the product or its price. The bag asks the server for current prices and stock (`GET /api/catalog/availability`, up to 50 SKUs at once, briefly cached) and shows "Checking current prices…" until they arrive. A price the server has not confirmed is marked as such.

| Rule | Value |
| --- | --- |
| Most per SKU | 10 (and no more than counted stock) |
| Most lines | 50 |
| Free delivery | At ₹1,199 or more |
| Delivery charge | ₹79 below ₹1,199 |
| GST | Included in every price (18%) |

For signed-in customers the bag and wishlist are mirrored to the server. On sign-in a guest bag is merged with the account's: per SKU the larger quantity wins (never the sum, so repeated sign-ins cannot inflate it), capped at the purchase limit and stock, with any change explained in the bag. On sign-out the account's bag is cleared from the browser. A bag save for a different account than the one signed in is refused, so one person's bag can never be written into another's.

## Checkout

`/checkout` reads prices and stock fresh from the database (never from a cache), because this is the moment the customer agrees to a total.

1. **Details.** Email, delivery address (with an Indian PIN code and mobile number check) and payment method: Cashfree (online) or cash on delivery.
2. **Phone check for guests.** When an SMS provider is configured, a guest proves the delivery mobile number with a six-digit code. The proof is signed, lasts 8 hours and is bound to that number; the server refuses a guest order without it. Signed-in customers are not asked.
3. **Price check.** Each line carries the price the customer was shown. If an offer ended or the owner changed a price in the meantime, the order is refused with "The price of … changed from ₹949 to ₹999" before anything is reserved, and the page shows the new total.
4. **Stock check.** Reservation happens in the database with an update that only succeeds if enough units remain. Twenty simultaneous attempts on ten units grant exactly ten.
5. **Idempotency.** Every checkout carries a random key. Pressing Place order twice, a network retry or a reload all return the same order. Since 21 October 2026 a replay is only answered for the **same email**, so a key alone can never reveal another customer's order.

## After payment is abandoned

Online orders reserve stock when the customer presses Pay. If they back out:

- On returning to the shop (Back button, reload, or the return page), checkout asks Cashfree to terminate the payment session. Only when Cashfree confirms it is closed (`TERMINATED` or `EXPIRED`) is the order cancelled and its stock returned. If a payment succeeded in the meantime, the payment is applied instead.
- The page says "nothing was ordered and you have not been charged", resets the Pay button and uses a new idempotency key, so the next attempt is a fresh order.
- Anything not closed this way is caught by the morning sweep, which also asks the provider before cancelling.

# Payments {#payments}

## Methods

| Method | Provider | Status |
| --- | --- | --- |
| UPI, cards, net banking, wallets | Cashfree Payment Gateway | Built and tested in Cashfree's sandbox; live keys need KYC |
| Cash on delivery | — | Live; subject to the risk check |
| Razorpay | Razorpay | Replaced by Cashfree on 9 October 2026; code kept only to settle older Razorpay orders |

## Three rules that protect the money

1. **The amount is computed on our server.** The browser sends product ids, sizes and quantities only. Cashfree is asked to collect exactly the order total the server calculated.
2. **The browser's word is never evidence.** When the customer returns from Cashfree, `/api/payments/cashfree/verify` asks Cashfree for the order's payments rather than believing the browser.
3. **The webhook is authoritative.** Cashfree also posts each payment result to `/api/webhooks/cashfree`, signed with the secret key over the exact raw bytes. A closed tab cannot lose a payment, because the webhook still arrives; and the daily reconciliation asks Cashfree about any order still in doubt.

## The payment state machine

All three paths (return page, webhook, reconciliation) feed the same decision function, `decide()` in `src/modules/payments/state-machine.ts`, applied with the order row locked (`SELECT … FOR UPDATE`), so a webhook and the browser arriving within milliseconds are applied one after the other.

| Current state | Signal | Result |
| --- | --- | --- |
| unpaid, pending, failed | Captured, amount equals the order total | paid (stock re-reserved if it had been released) |
| any | Captured, amount differs from the total | Rejected and recorded; order unchanged |
| paid | Captured again | Ignored as a duplicate |
| refunded | Captured | Rejected |
| paid or refunded | Failed | Ignored: a failed retry after a success changes nothing |
| unpaid, pending | Failed | failed, stock released |

Two cases need a person, and set `attention_reason` on the order with an `order.needs_attention` event:

- **Paid after the stock was sold to someone else.** The money is real and must be honoured, but the goods are gone: refund or fulfil from a backorder.
- **Paid after the order was cancelled.** The stock is re-reserved; confirm with the customer before sending.

## Recording provider events exactly once

Every webhook delivery is written to `payment_events` keyed by the provider's own event id, in the same transaction as its effect. A duplicate delivery conflicts on that key and changes nothing. An event for an order that does not exist yet (the webhook outran our own checkout commit) is answered with a retryable 503 and not recorded, so Cashfree's retry is processed properly.

## Cash on delivery

A cash-on-delivery order is real when placed, so it is announced straight away and stays `unpaid` until delivered. Since 21 October 2026, when it is delivered (by the courier's update or the manager's button) the payment is recorded as **paid** through the same state machine. Before this, COD sales never appeared in revenue.

Every COD order passes the risk check (Chapter [[owner]]) before it can be packed.

## Setting up Cashfree for live payments

1. Complete Cashfree KYC and activation. Cashfree reviews the policy pages, which still have `[TO CONFIRM]` markers to fill in first.
2. Set `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` and `CASHFREE_ENV=production` in Vercel.
3. Register the webhook `https://YOUR-DOMAIN/api/webhooks/cashfree` in the Cashfree dashboard.
4. Place one small real order and refund it, to check the whole path.

> **Note.** In the sandbox, Cashfree cannot reach `localhost`, so local tests rely on the return-page verify plus reconciliation. Test the real webhook on a staging address in a normal browser.

# Orders, tracking and notifications {#orders}

## What the customer sees

The order page shows five steps, in words customers use rather than internal names:

| Internal status | Customer sees |
| --- | --- |
| pending, paid | Order placed |
| fulfilled | Being prepared |
| shipped | On its way |
| out_for_delivery | Out for delivery |
| delivered | Delivered |

Once a courier is booked the page also shows the courier name and the tracking number, linked to Shiprocket's public tracking page.

## Who can see an order

`/orders/AVY-XXXXXX` shows a name, address and phone number, so access is strict: the signed-in account that placed it, or a signed token bound to that one order number (carried in the link in the confirmation email). A token for one order cannot be replayed against another. `/track-order` needs both the order number and the email it was placed with, gives the same answer whether the order is missing or the email is wrong, and is rate limited (20 a minute) so it cannot be used to guess.

## Messages sent

| When | To | Channel | Content |
| --- | --- | --- | --- |
| COD order placed, or online order paid | Customer | Email | Items, total, payment, address, private order link |
| Same | Owner | Email (`OWNER_EMAIL`) | Order summary and payment state |
| Same | Owner | WhatsApp | One line: order number, total, paid or COD, item count, city |
| Parcel picked up by the courier | Customer | Email | Courier, tracking number and link, amount to keep ready if COD |
| Every morning | Owner | WhatsApp and email | Last 24 hours of orders and sales, what is low, restock requests raised |
| Owner signs in | Owner | Email | Six-digit sign-in code |

A customer email the provider refused is retried (up to 5 times); a failed owner copy is only logged.

> **Known issue.** On 12 October 2026 Meta rejected the WhatsApp alert with "API access blocked". The WhatsApp access token or app permission needs renewing in Meta's developer console; email alerts are unaffected.

# What customers and staff are told {#messages}

The exact wording the system uses, taken from the code, so the owner knows what customers receive and can ask for changes. Text in angle brackets is filled in per order.

## Order confirmation (customer email)

Sent when a cash-on-delivery order is placed, or an online order is paid. Subject: **Your Avyora order <order number>**.

```
Thank you, <name>.

Order <order number>
  2 x <product> (<size>)

Total: ₹<total>
<Paid online. | Cash on delivery — please keep the amount ready. | Payment pending.>

Delivering to:
<address line>
<city state PIN>
<phone>

Track your order here:
<private order link>

We will email again when it is on its way.
```

The private link carries a signed token for that one order, so a guest who closes the tab can still find it.

## Shipped (customer email)

Sent when the courier picks the parcel up. Subject: **Your Avyora order <order number> has shipped**.

```
Good news, <name>: your order <order number> is on its way.

Courier: <courier>
Tracking number: <AWB>
Follow it here: https://shiprocket.co/tracking/<AWB>

<Cash on delivery: please keep ₹<total> ready. | Already paid. Nothing to pay at the door.>

Your order: <private order link>
```

## New order (owner email and WhatsApp)

Email subject: **New order <order number> — ₹<total>**. The body lists the items, total, payment (paid, cash on delivery, or NOT PAID), the customer's name and email, and the delivery address.

WhatsApp, kept to one line for reading on a phone:

```
New order AVY-7KQ2MX — ₹798 (COD). 2 items to Pune.
```

## Morning summary (owner)

WhatsApp:

```
Avyora, last 24 hours: 3 orders, ₹2,847. Running low: 2 items. 2 new restock requests raised for you to approve.
```

Email (subject **Avyora morning summary**) adds one line per low item, for example "HA Toner (150ml): 10 left, about 5 days", and ends: "Approve or decline requests in the owner console under Requests." On a quiet stock day it says "Stock: everything is above its reorder level."

## Sign-in codes

Customer email code. Subject: **<code> is your Avyora sign-in code**.

```
Your Avyora sign-in code is <code>.

It expires in 10 minutes and can be used once.
If you did not ask to sign in, you can ignore this email — nobody can
use this code without it.
```

Owner's second step. Subject: **Your Avyora sign-in code**.

```
Your owner sign-in code is <code>. It expires in 10 minutes.

If you did not just try to sign in, someone has your password: change it now.
```

## On screen: checkout

| Situation | Message |
| --- | --- |
| Price changed since shown | "The price of <product> (<size>) changed from ₹949 to ₹999. Review your updated total, then place your order again." |
| Sold out while ordering | "<product> (<size>) has just sold out." |
| Not enough left | "Only <n> left of <product> (<size>). Please reduce the quantity." |
| Size withdrawn | "<product> is no longer sold in <size>. Please choose a size again." |
| Guest phone not verified | "Verify your mobile number with the code we send before placing the order." |
| Backed out of payment | "Your payment was not completed, so nothing was ordered and you have not been charged. Your bag is still here: try again, or choose cash on delivery." |
| Sample catalogue on the live shop | "This is a preview shop: the products shown are samples and cannot be ordered yet." |
| Too many attempts | "Too many attempts. Please wait <n> seconds and try again." |
| Safety checks unavailable | "This is temporarily unavailable. Please try again in a moment." |

## On screen: the skin chat

| Situation | Message |
| --- | --- |
| Not signed in | "Please sign in to use the skin chat." (the page itself redirects to sign-in) |
| Chat not configured | "The skin chat is not switched on yet." |
| Daily budget or rate reached | "You have sent a lot of messages. Please wait a little and try again." |
| Urgent symptom | "Please see a doctor or dermatologist soon about <reason>. If it is severe or getting worse quickly, or you have trouble breathing, go to emergency care now. Skincare products are not the right fix for this." |
| Off-topic request the model declines | "I can't help with that one. I'm happy to talk about skin concerns and everyday skincare: tell me what you're noticing." |
| Provider failure | "Sorry, the skin chat is unavailable right now. Please try again in a little while." |

## On screen: staff

| Where | Message |
| --- | --- |
| Dispatch, unpaid online order | "Not paid. Do not send; check with the owner." |
| Dispatch, COD | "Cash on delivery — collect payment at the door." |
| Dispatch, held by risk check | "On hold — this cash-on-delivery order failed an automatic check. Confirm with the customer before packing." |
| Dispatch, attention | "On hold — the owner needs to decide what happens to this order before it is packed." |
| Book courier, not packed | "Mark the order packed before booking a courier." |
| Book courier, Shiprocket not set up | "Shiprocket is not connected yet. Ask the owner to add its login." |
| Book courier, no courier available | "No courier could take this parcel yet: <reason>. Check the PIN code, or retry from the Shiprocket panel." |
| Pricing, two editors | Refused with a "changed since you opened it" message |
| CMS publish with a banned claim | "Not published: "<phrase>" (<reason>). Edit the draft and try again." |

## Changing the wording

Customer emails live in `src/lib/order-notifications.ts` and `src/lib/notify.ts`; staff and checkout messages in the files of the screens that show them. Changing them is a small, safe edit, but the claim rules (Chapter [[catalogue]]) apply to customer-facing text, and delivery figures must come from `src/lib/money.ts`.

# Accounts and sign-in {#accounts}

## Customer sign-in

The sign-in page asks for an email first, then offers only the methods that account can actually use:

| Method | Notes |
| --- | --- |
| Google | Through Auth.js; the account is created on first sign-in |
| Email code | Six digits, stored hashed, valid 10 minutes, five wrong guesses burn it. Offered only when email delivery works |
| Password | PBKDF2-hashed; sign-up and reset by email code |
| Phone code | Offered only when an SMS provider is configured (DLT registration is required in India) |

Customer sessions are stored in the database, so they can be revoked from the server. All sign-in steps are rate limited (10 attempts per 10 minutes per identity, 30 per network address; codes 3 per 15 minutes, at most one a minute).

## The account area

| Page | Purpose |
| --- | --- |
| `/account` | Hub: orders, addresses, routines, data and permissions |
| `/account/orders` | Order history with links to each order and invoice |
| `/account/addresses` | Address book: add, edit, delete, choose a default. Each address is checked against its owner on every change |
| `/account/routines` | Saved routines and their state (current, outdated, expired, permission withdrawn), weekly feedback, delete, withdraw permission |
| `/account/data` | What is stored, and the permissions granted |

A signed-in customer with a saved address may also see a short note when conditions where they live are unusual: very high UV, very dry air or poor air quality (from Open-Meteo, cached per region). It shows nothing on an ordinary day.

## Guests who own things

A guest who saves a routine is given a random secret in an `HttpOnly` cookie; only its SHA-256 hash is stored. When they later sign in, everything the guest owned is moved to the account in one transaction.
