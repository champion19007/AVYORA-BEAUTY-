::part Quick reference
One-page cards for the stockroom and the owner, and the words used in this manual.

# Quick-reference cards {#cards}

These cards are written to be printed and kept by the packing table or the owner's desk.

## Card 1. Stockroom: sending today's orders

1. Sign in at `/admin-login` with the manager login. You land on **Dispatch**.
2. Work from the **top**: oldest first.
3. Skip any card with a **red line** (on hold, or not paid). Those wait for the owner.
4. Pick the items under **Pack** and box them.
5. Press **Mark packed**.
6. Press **Book courier**. If it shows an error, tell the owner and move to the next card.
7. Press **Print the shipping label**, stick it on, and put the box with the others for pickup.
8. When the courier collects, hand over every labelled box. The orders update by themselves from here.

> Cash on delivery? The card says "Cash on delivery: collect payment at the door". The courier collects it; you do nothing extra.

## Card 2. Stockroom: stock arrived or removed

1. Open **Stock**. Find the product and size.
2. Count what is in your hand.
3. Type `+` and the number (for example `+24`), or `-` and the number for damaged or samples (`-2`).
4. Press **Apply**. Check the "On shelf" number changed.

Never type the new total: type the change.

## Card 3. Stockroom: a parcel came back

1. The courier marks it returned; the stock is put back automatically.
2. Open the box. Check every item.
3. Damaged items: open **Stock**, type a minus number for them, press **Apply**, and tell the owner.

## Card 4. Owner: every morning (5 minutes)

1. Read the **morning summary** on WhatsApp or email: orders, sales, what is low.
2. Open `/admin` → **Requests**:
   - Restock requests: order from your supplier, then press **Ordered** (or **Decline**).
   - Support messages: reply by email, then **Mark answered**.
   - Reviews: **Publish** genuine ones, **Reject** spam.
3. Open **Orders**:
   - Held COD orders: phone the customer, then **Release for dispatch** or **Cancel and restock**.
   - Orders needing attention: read the reason, act (refund, resend, contact the customer), then clear it with a note.

## Card 5. Owner: every week

| Check | Where |
| --- | --- |
| Sales and stock cover by product | Owner console → Analytics |
| Nothing stuck in the system | Owner console → System (failed or dead jobs and deliveries: press Replay once fixed) |
| Courier problems | Shiprocket panel: undelivered and returned parcels |
| AI chat spend | Anthropic console → Usage |
| Payments match | Cashfree dashboard settlements against Analytics revenue |
| Stock count | Spot-check a few shelves against the Stock screen |

## Card 6. Owner: changing a price or running an offer

1. Owner console → **Pricing** → find the product and size.
2. **Price** is the normal price. **Offer** is the sale price (must be lower). **Label** is the badge text. **Ends** is optional.
3. Press **Save**. The shop, bag and checkout all change together.
4. To end an offer early: clear **Offer**, press **Save**.

## Card 7. Something is wrong

| Symptom | First step | Chapter |
| --- | --- | --- |
| "Something went wrong" on the site | Note the reference number; check `/api/health` | [[runbooks]] |
| Customer says they paid, order unpaid | Check the Cashfree dashboard; never mark it paid by hand | [[runbooks]] |
| No order emails | Owner console → System, failed deliveries | [[runbooks]] |
| WhatsApp alerts stopped | Renew the Meta token | [[runbooks]] |
| Book courier fails | Read the card's message; PIN code or Shiprocket login | [[runbooks]] |
| Owner sign-in code not arriving | Check email settings; emergency `OWNER_TWO_STEP=off` | [[runbooks]] |
| Data deleted by mistake | Neon point-in-time restore within 6 hours | [[runbooks]] |

## Card 8. Who to contact

| For | Where |
| --- | --- |
| Hosting, deployments, logs | Vercel dashboard (vercel.com) |
| Database | Neon console (console.neon.tech) |
| Payments | Cashfree merchant dashboard |
| Couriers and labels | Shiprocket panel (app.shiprocket.in) |
| AI chat billing | Anthropic console (console.anthropic.com) |
| WhatsApp alerts | Meta for Developers |
| Code changes | The repository on GitHub and the developer who maintains it |
# Owner questions and answers {#faq}

Short answers to the questions owners ask most, with where to read more.

## Orders and money

**A customer says they paid but I see "unpaid". Should I mark it paid?**
No, and there is no button for it on purpose. Check the Cashfree dashboard. If Cashfree shows the payment, the webhook or the next reconciliation will mark the order paid on its own. If Cashfree shows no payment, the customer was not charged. (Chapter [[runbooks]].)

**Why does revenue not include an order I can see?**
Revenue counts paid orders only. Online orders count when paid; cash-on-delivery orders count when delivered. Cancelled, refunded and returned orders never count.

**Can I give a customer a discount code?**
Not yet: there are no coupons, by design, until the rules are defined (Chapter [[launch]]). You can run an offer on any product in Pricing, with an optional end date.

**What happens if I change a price while someone is checking out?**
Their order is refused with a message showing the new price, before anything is reserved. They see the new total and can place the order again. Nobody is charged a price they did not see.

**Why was a cash-on-delivery order cancelled by itself?**
The risk check refused it: a score of 70 or more with at least two signals agreeing (for example filler text in the address and several COD orders the same day). The stock went back on the shelf. If you think it was genuine, contact the customer; one strong signal on its own only ever holds an order for you to decide.

**How do I refund someone?**
From the Cashfree dashboard. Then cancel the order in the owner console if it has not shipped, so the stock goes back.

## Stock

**The site says "Out of stock" but I have the product.**
Nobody has counted it in the system. The stockroom adds the count in Stock (type `+` and the number, press Apply).

**Why did I get a restock request I did not ask for?**
The morning autopilot raises one when a product will run out within the supplier lead time at its recent sales rate. The note says how fast it sells and how many days are left. Approve it once you have ordered from the supplier, or decline it.

**Can the system order from my supplier automatically?**
No. It needs supplier details and a spending rule from you first (Chapter [[autopilot]]).

## Deliveries

**Which courier will be used?**
Whichever Shiprocket assigns by the priority set in your Shiprocket account: cheapest, fastest or recommended.

**A parcel shows "delayed". Do I need to do anything?**
No. Delays are recorded on the parcel; the order stays "On its way". You are alerted only for problems that need you: undelivered, lost, damaged or returning.

**What happens to a returned parcel?**
When Shiprocket reports it back with you, the order becomes "returned" and the stock goes back on the shelf automatically. If the customer had paid online, the order is flagged so you remember to refund them.

## Staff and access

**The manager is away. Can I pack orders?**
Yes. The stockroom is open to the owner too; use "Stockroom" from the owner console.

**How do I change a staff password?**
Generate a new hash (`node scripts/hash-password.mjs 'new-password'`), set it in Vercel, redeploy (Chapter [[services]]). Changing `SESSION_SECRET` signs everyone out.

**I am not getting the sign-in code email.**
Check the spam folder and that email sending works (order emails arriving?). In an emergency, set `OWNER_TWO_STEP=off` in Vercel and redeploy, sign in, fix email, then remove it.

**Can the manager see revenue or change prices?**
No. The manager's screens show what to pack and stock levels only. Every owner action is checked on the server, so guessing an address does not help.

## The AI chat

**How much will the chat cost me?**
At most ₹0.50 per signed-in person per day, plus a site-wide cap of 2,000 messages a day. A typical message costs ₹0.03 to ₹0.07. Set a monthly spend limit in the Anthropic console as well.

**Can I make it recommend specific products more?**
It already recommends Avyora products first, matched to the concern, and never other brands. To change its wording or priorities, a developer edits its instructions (Chapter [[devguide]]).

**Does it give medical advice?**
No. It is instructed never to diagnose or prescribe, and urgent symptoms trigger a "see a doctor" notice from the server before the AI answers.

## The site

**Is the site fast enough for a sale or a big campaign?**
Public pages are served from Vercel's cache and barely touch the servers. The limits are the plan (move to Pro) and the database's compute (upgrade Neon if traffic grows). See Chapter [[scaling]].

**What happens if the database goes down?**
Product pages stay up and show items as out of stock; checkout, sign-in and staff screens show a "try again" message. Nothing is lost; everything resumes when the database answers.

**How do I put the shop on my own domain?**
Add it in Vercel → Settings → Domains, then update `NEXT_PUBLIC_SITE_URL`, the Google sign-in redirect, and the Cashfree and Shiprocket webhook addresses (Chapter [[services]]).

**Where is a full list of everything the site does?**
Appendix B lists every page and API address; Appendix C every setting.

# Glossary {#glossary}

| Term | Meaning |
| --- | --- |
| AWB | Air waybill: the courier's tracking number for a parcel |
| Backorder | Selling a SKU past zero on purpose (made to order, pre-order) |
| Cash on delivery (COD) | The customer pays the courier at the door |
| CMS | Content management system: where the owner edits site text |
| Consent | A recorded permission, for example to save a routine |
| Cron | A job that runs on a schedule |
| CSP | Content Security Policy: a browser rule limiting where scripts and data may come from |
| Edge | Vercel's servers close to the visitor, which serve cached pages |
| Event (domain event) | A record that something happened, such as an order being paid, used to trigger follow-up work |
| Idempotency key | A random key that makes repeating the same request harmless |
| INCI | The standard international names for cosmetic ingredients |
| ISR | Incremental static regeneration: pre-built pages refreshed in the background |
| Knowledge release | An immutable, checksummed bundle of approved skincare knowledge |
| Migration | A numbered change to the database structure |
| Neon branch | A copy of the database, used for rehearsals and tests |
| Outbox | Writing events in the same transaction as the change, so neither can exist without the other |
| Paise | One hundredth of a rupee; all money is stored in paise |
| PGlite | Postgres compiled to run inside the test process |
| Rate limit | A cap on how often something can be done |
| Reconciliation | Asking the payment provider what really happened to an order |
| RTO | Return to origin: the courier brings an undelivered parcel back |
| Server action | A form submission handled on the server |
| SKU | Stock-keeping unit: one product in one size |
| Sweep | The daily job that releases abandoned stock and tidies expired data |
| Token (AI) | A unit of text the AI model reads or writes; billing is per token |
| Webhook | A message a provider sends to the site when something happens |
