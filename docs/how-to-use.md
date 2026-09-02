# How to run the Avyora shop

Three people use this site, and each sees a different part of it.

| Who | Where they go | What they can do |
|---|---|---|
| **Customer** | the shop itself | Browse, buy, track their order |
| **Stockroom** (inventory manager) | `/manager` | Pack and send orders, count stock, ask for more |
| **Owner** | `/admin` | Prices, offers, sales figures, approve restocking |

Both staff roles sign in at the **same page** — `/admin-login` — and land in
different places. The manager cannot open the owner's screens, and the link
being public is fine: it is a locked door, not a hidden one.

Usernames and passwords are in `avyora-admin-password.txt` on the Desktop.

---

## For the stockroom manager

### Sending an order

1. Sign in. You land on **Dispatch**.
2. Orders are listed **oldest first** — work from the top; that person has
   waited longest.
3. Each card tells you everything needed to pack: what goes in, who it goes to,
   the address and a phone number.
4. Press the buttons in order as you do the work:

   | Press | The customer sees |
   |---|---|
   | Mark packed | Being prepared |
   | Hand to courier | On its way |
   | Out for delivery | Out for delivery |
   | Mark delivered | Delivered |

**Before you send, check the payment line.** If it says *cash on delivery*,
send it and collect at the door. If it says **"Not paid. Do not send"**, that
order was abandoned at the payment step — leave it and tell the owner.

You cannot cancel an order. That involves refunding money, so it is the
owner's job.

### Counting stock

Go to **Stock**. Enter **what changed**, not the new total:

- Put twelve on the shelf → type `12` → Apply
- Take three off → type `-3` → Apply

The system does the arithmetic. This is deliberate: you know what you just
handled, and asking you to work out a new total is how miscounts get in.

**Anything showing "Out of stock" cannot be bought by customers** — including
items nobody has ever counted. If a product should be on sale, give it a count.

### Asking for more

On the **Stock** page, put a number in the "Need more" box and press
**Request**. The owner sees it with the count you had at the time.

One open request per item; asking twice does not make it louder.

---

## For the owner

### Overview

`/admin` shows what needs attention: money taken, orders awaiting payment,
orders paid but not yet packed, and a warning when stock is low or out.

Revenue counts **only paid orders**. Baskets abandoned at the payment step are
excluded, because ordering stock against them would mean buying for sales that
never happened.

### Changing a price or running an offer

**Pricing** → find the product → type in rupees → **Save**.

- **Price** — the normal price
- **Offer** — the discounted price; must be *below* the normal price
- **Label** — what customers see on the badge, e.g. "Festive 20% off"
- **Ends** — leave blank to run until you stop it

To end an offer, clear the Offer box and save. The normal price is remembered
throughout, so you never have to type it back in.

### Restocking

**Requests** shows what the stockroom asked for, with the count they had at the
time. Press **Ordered** once you have actually bought it, or **Decline**.

Only you can close a request — the same person asking and marking it done would
make the record worthless.

### Reading the numbers

**Analytics** covers the last 30 days, excluding cancelled and refunded orders.

- **Units sold** and **Revenue** per product, ordered by units, because units
  drive what you reorder
- **Cover** — roughly how many days of stock remain at the recent rate
- **Next 7 days** — a straight-line estimate

**On the forecast, plainly:** it is a moving average, not a prediction model.
It assumes the next week looks like the last one, which is wrong over a
festival, a launch or a bad review. The sample size is printed beside it.
Treat it as a prompt to look, not an instruction to buy.

### Changing stock yourself

You can, and the console asks twice before letting you. That is on purpose: the
stockroom is at the shelf and you are not, so a number you type from memory
overwrites something that was physically counted. Use it when the manager is
away, not as routine.

---

## For customers

Nothing here needs explaining, but two things are worth knowing:

- **Order tracking.** Customers see five steps — Order placed, Being prepared,
  On its way, Out for delivery, Delivered — driven by the buttons the stockroom
  presses. They never see internal words like "fulfilled".
- **Out of stock is real.** Items with no stock count cannot be added to an
  order. If something should be on sale and is not, it needs counting in the
  stockroom.

---

## Before opening the shop

**Count everything.** A product with no stock count cannot be sold at all. On a
fresh deployment that means the whole catalogue. Either:

```bash
npm run db:seed-inventory 25
```

or count each item in the stockroom console.

Then check the setup is complete:

```bash
npm run check:env -- --production
```

See `docs/deploy.md` for the full deployment steps.
