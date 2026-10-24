::pagebreak
# About this manual

This manual describes the Avyora skincare shop as it exists on 21 October 2026: what it does, how it is built, how it keeps money and customer data safe, and how to run it day to day. It was written from the code, not from plans. Where a feature is built but switched off, or designed but not yet built, the manual says so plainly.

It is written for three readers:

- **The owner.** Parts I, IV, VI, VII and IX explain what the system does, what needs a decision, and what to do when something goes wrong. No programming knowledge is needed.
- **The staff.** Chapter [[stockroom]] (the stockroom), the cards in Chapter [[cards]] and the in-app Help page cover everything the person who packs parcels needs.
- **A developer** joining later. Parts II, III, V and VIII explain the architecture, the reasoning behind the important decisions, and where each piece lives in the code. The appendices list every table, page, API address and setting, generated directly from the code.

## How the manual is organised

| Part | What it covers |
| --- | --- |
| I. The shop | What Avyora sells, who uses the system, and the shop at a glance |
| II. Architecture | How the system is put together: hosting, layers, data, events, caching, search and design |
| III. Customer features | Customer journeys, then everything a shopper touches, from the home page to the AI skin chat |
| IV. Running the shop | The owner console, the stockroom, Shiprocket deliveries, stock autopilot, the CMS |
| V. Security and privacy | How orders, money and personal data are protected, what data is held and for how long |
| VI. Operating the system | Deploying, setting up each outside service, scaling, monitoring and incidents, testing |
| VII. History and next steps | What is left before launch, a launch-day checklist, how it was built, and why |
| VIII. Developer reference | The main flows, the API, and recipes for common changes |
| IX. Quick reference | Printable cards, owner questions and answers, and a glossary |
| Appendices | Generated reference: tables, pages, APIs, settings, migrations, tests |

## Conventions

- **Money** is written in rupees in the text (₹1,199) and stored as whole paise in the system (119,900 paise). Paise avoid rounding errors.
- **File paths** such as `src/lib/orders.ts` point to where something lives in the code.
- **Notes** in shaded boxes are things worth stopping for: a decision, a limit, or a common mistake.
- **"Switched off"** means the code is built and tested but a setting keeps it hidden until the owner turns it on.

> **Where to start.** If you only read one chapter, read Chapter [[glance]] (Avyora at a glance). If something is broken right now, go to Chapter [[runbooks]] (incidents and runbooks).

::part The shop
What Avyora sells, who uses each part of the system, and where things stand today.

# Avyora at a glance {#glance}

Avyora is an online skincare shop for customers in India. It sells a range of 27 products in 30 sizes: cleansers, exfoliants, toners, essences, serums, masks, moisturisers, sunscreens and body care. What sets it apart from a plain shop is that it helps people build a simple routine: a questionnaire produces a seven-day morning and evening plan from products that fit their skin, their budget and what they already own, and an AI guide answers everyday skin questions.

## What the system does

| Area | In one line |
| --- | --- |
| Shop | Browse, filter and compare products, with prices and stock that match what checkout charges |
| Checkout | Pay online through Cashfree (UPI, cards, net banking) or cash on delivery |
| Orders | Confirmation email, a private order page, tracking by number and email |
| Deliveries | Shiprocket books the courier and prints the label; tracking updates move the order by themselves |
| Stock | Reserved the moment an order is placed, returned if payment is abandoned or a parcel comes back |
| Autopilot | Every morning, works out what is running low, raises restock requests, and messages the owner |
| Routine finder | A questionnaire that produces a safe weekly routine within a budget |
| Ask Avyora | Instant answers about ingredients and products, computed on the customer's device, no AI |
| AI skin chat | A conversation with an AI skincare guide for signed-in customers, capped at ₹0.50 per person per day |
| Owner console | Orders, prices and offers, stock, analytics, restock approvals, content, reviews, system health |
| Stockroom | The dispatch queue, stock counts, restock requests, and a help page |
| Content (CMS) | Product copy, journal articles and media, with drafts, revisions and publish checks |

## Where it runs

- **Website and servers:** Vercel, in its Singapore region (`sin1`), at https://avyora-beauty.vercel.app.
- **Database:** Neon Postgres (version 18), in AWS Singapore. This is the single source of truth for orders, payments, stock and accounts.
- **Payments:** Cashfree (currently in test mode). Razorpay code remains only to settle any older Razorpay orders.
- **Couriers:** Shiprocket, once its login is added.
- **Email:** Gmail or Resend for order emails and sign-in codes. **WhatsApp:** Meta's WhatsApp Cloud API for the owner's order alerts.
- **AI:** Anthropic's Claude Haiku 5.5, for the skin chat only.

## The state of things today

The system is complete enough to take real orders, but a full public launch is waiting on business inputs rather than code. The main ones, covered in Chapter [[launch]]:

- **Sample catalogue.** The live catalogue is in `sample` mode: product records are placeholders, and production refuses real orders until verified product records are loaded.
- **Payments in test mode.** Cashfree runs against its sandbox; live keys need business verification (KYC).
- **Plan limits.** Vercel's free Hobby plan does not allow commercial use. It must move to Pro (about $20 a month) before selling.
- **Business details.** Policy pages still carry `[TO CONFIRM]` markers for the registered business name, address, GSTIN and grievance officer.
- **Photography and product information.** Approved product photos, full ingredient lists and reviewed usage directions are not in the system yet.

> **Note.** None of these are bugs. The system deliberately refuses to sell placeholder products or show unreviewed medical-sounding claims until the real information exists.

# Who uses the system {#users}

Three kinds of people use Avyora, and each sees a different part of it.

| Who | Where they go | What they can do |
| --- | --- | --- |
| Customer | The shop itself | Browse, buy, track orders, save routines, chat with the AI guide |
| Stockroom manager | `/manager` | Pack and send orders, book couriers, count stock, ask for more |
| Owner | `/admin` | Everything the manager can, plus prices, offers, analytics, approvals, content and system health |

Both staff roles sign in at the same page, `/admin-login`, and land in different places. The manager cannot open the owner's screens. The sign-in link being public is fine: it is a locked door, not a hidden one. Every owner-only action is checked again on the server, so even a manager who guessed an address could not change a price.

## Customers

Customers can shop as guests or sign in with Google, an email code, a password, or a phone code. Signing in brings their bag and wishlist with them across devices, keeps their addresses and order history, and lets them save routines. The AI skin chat is for signed-in customers only, because its daily spending limit is per account.

## The stockroom manager

The manager's world is a queue: what has to leave the building today. The dispatch screen lists orders oldest first, each with everything needed to pack it: what goes in, who it is for, where it goes, and a phone number for the courier. The manager presses a button for each step (packed, book courier), and from then on the courier's own updates move the order. The manager can also adjust stock counts and request more stock, but cannot cancel orders or change prices: both involve money, which is the owner's decision.

## The owner

The owner sees everything the manager sees, plus the money: revenue, sales by product, days of stock cover, prices and offers. The owner approves restock requests, decides on orders held by the cash-on-delivery risk check, publishes content and knowledge, moderates reviews, and watches system health. Owner sign-in needs the password and a six-digit code emailed to the owner's address.

## The systems that act on their own

Some work happens without anyone pressing a button:

| What | When | Effect |
| --- | --- | --- |
| Payment webhooks | When Cashfree reports a payment | Marks the order paid, sends the confirmation, alerts the owner |
| Courier webhooks | When Shiprocket reports a parcel's progress | Moves the order to shipped, out for delivery, delivered or returned |
| Event drain | Straight after each order or payment, plus daily | Sends emails, runs the risk check, refreshes cached pages |
| Morning sweep | Daily, 08:45 India time | Releases stock from abandoned payments, raises restock requests, sends the morning summary, deletes expired private data |
| Event backstop | Daily, 09:15 India time | Retries any email or event that failed the first time |
