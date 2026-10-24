::part Security and privacy
How the shop stops people getting products for free, taking customer data, or misusing staff access; what personal data it holds, who receives it and how long it is kept.

# Security {#security}

This chapter is organised as a threat model: for each thing an attacker might try, what stops it and where. It reflects a review of the payment, order, account and staff code carried out on 21 October 2026, during which one weakness was found and fixed (the order replay key, below), and the dependency audit reported no known vulnerabilities in the libraries the site runs (`npm audit --omit=dev`: 0).

## Getting products for free

| Attempt | What stops it | Where |
| --- | --- | --- |
| Edit the price in the browser or the request | Prices are never accepted from the client; every line is priced on the server from the catalogue and owner overrides. The shown price is only compared, and a mismatch refuses the order | `src/lib/orders.ts` |
| Order a negative or huge quantity | Strict schema: whole numbers 1 to 20 per line on the server (the shop caps at 10), at most 50 lines; unknown sizes refused, never substituted | `checkoutSchema` |
| Order more than is in stock | Reservation is a conditional database update inside the order transaction; it cannot go below zero | `reserveStock` |
| Pay ₹1 for a ₹1,000 order | Cashfree is asked to collect the server's total; a captured amount different from the order total is rejected by the payment state machine | `state-machine.ts` |
| Pretend to have paid (fake return page) | The return page's claim is ignored; the server asks Cashfree for the order's payments | `cashfree/verify` |
| Send a fake payment webhook | The webhook is verified with Cashfree's signature over the exact raw bytes and timestamp, compared in constant time; unsigned or altered requests get 401 | `api/webhooks/cashfree` |
| Replay a real webhook | Each provider event is recorded once by its id; duplicates change nothing | `recordProviderEvent` |
| Mark an order paid by hand | No screen or API sets payment status; only provider events and COD delivery do, through the state machine | `admin/actions.ts` |
| Fake a courier "delivered" to trigger COD payment | The courier webhook needs a secret token in `x-api-key`, compared in constant time; with no token configured it refuses everything | `api/webhooks/courier` |
| Use a discount code | There are no coupons, bundles or loyalty points; no code path applies a discount. The content rules block advertising offers checkout does not apply | `content-claims.ts` |
| Place fake cash-on-delivery orders | Risk scoring holds or refuses suspicious ones; guests prove their mobile number by SMS when SMS is configured; checkout is rate limited | `cod-risk.ts`, `checkout-phone.ts` |
| Hold stock hostage with abandoned payments | Abandoned online orders are cancelled (after asking Cashfree) and their stock returned, on back-out and by the morning sweep | `reservation-sweep.ts` |
| Order a sample product on the live shop | Sample catalogue orders are refused in production | `catalogue-mode.ts` |
| Cancel someone else's payment | The cancel endpoint needs that order's signed access token | `cashfree/cancel` |

## Taking customer data

| Attempt | What stops it |
| --- | --- |
| Open another customer's order page | Needs the signed-in owner of the order, or a signed token bound to that order number. A token for one order is useless for another |
| Guess orders on the tracking page | Needs order number **and** email; same answer for "no such order" and "wrong email"; 20 lookups a minute per identity and per address |
| **Reuse another customer's checkout replay key** | **Fixed 21 October 2026.** A retried checkout used to return the existing order (and a link to it) for anyone holding its random idempotency key. It now does so only for the same email; anyone else gets a generic error. A test covers it |
| Read or change another customer's address, routine, scan or wishlist | Every query is scoped to the owner (account id, or the guest cookie's hash); a foreign id answers "not found". Tests check each |
| Write one person's bag into another's | Bag saves carry an account key; a mismatch is refused |
| Enumerate accounts or newsletter subscribers | Sign-in and newsletter answers do not reveal whether an address exists |
| SQL injection | Every query goes through Drizzle with bound parameters; there is no string-built SQL. A test runs classic payloads against a real Postgres |
| Cross-site scripting | React escapes everything rendered; the only raw HTML is the product's structured data, built from our own catalogue with `<` escaped. Ask Avyora renders plain text only |
| Cross-site request forgery | Server actions carry Next.js's origin check; every state-changing API compares `Origin` with the site's host |
| Read data from logs | All logs and error reports pass through `redact()`: credentials, emails, phones, addresses, card fields, questionnaire answers, photos, IP addresses, tokens and signed URLs are masked, and free text is scrubbed of emails and mobile numbers |
| Intercept data in transit | HTTPS everywhere, with `Strict-Transport-Security` (2 years, preload) |

## Staff access

| Control | Detail |
| --- | --- |
| Separate roles | Owner and manager, with the role sealed inside the signed session |
| Every action re-checked on the server | `isAdmin()` (owner only) at the top of every owner action; pricing, content, system and knowledge also check the role themselves. Middleware alone is never trusted |
| Passwords | PBKDF2-SHA256, 210,000 iterations, per-password salt, constant-time comparison; stored only as hashes in settings |
| Owner second step | A six-digit code emailed to `OWNER_EMAIL` (added 21 October 2026). A leaked password alone cannot open the owner console |
| Sessions | HMAC-signed, `httpOnly`, `SameSite=Lax` cookie; 8 hours |
| Brute force | 8 sign-in attempts per 15 minutes per username and per address; codes allow 5 guesses; same timing whether the username or the password was wrong |
| Fail closed | No credentials, no session secret, or no rate limiter means no staff sign-in |
| Audit | Every sensitive change is logged with actor, role, before and after |

## Abuse and cost control

All limits are durable counters in Postgres shared by every server instance, keyed by hashed identifiers so no raw email or IP address is stored. Each can be changed without a code change through `RATE_LIMIT_OVERRIDES`.

| Policy | Per identity | Per address | Window | If the counter is down |
| --- | --- | --- | --- | --- |
| Customer sign-in | 10 | 30 | 10 minutes | Refuse |
| Send a code | 3 | 5 | 15 minutes | Refuse |
| Resend a code | 1 | — | 60 seconds | Refuse |
| Staff sign-in | 8 | 8 | 15 minutes | Refuse |
| Order lookup | 20 | 20 | 1 minute | Refuse |
| Checkout | 10 | 10 | 10 minutes | Refuse |
| Payment creation | 15 | 15 | 10 minutes | Refuse |
| Price quote | 60 | 60 | 1 minute | Allow (cheap, cached) |
| Support form | 3 | 10 | 1 hour | Refuse |
| Reviews | 5 | 20 | 1 hour | Refuse |
| AI chat messages | 8 | 8 | 1 minute | Refuse |
| AI chat spend | ₹0.50 | ₹0.50 | 1 day | Refuse |
| AI chat, whole site | 2,000 | — | 1 day | Refuse |
| Page views (edge) | — | 120 | 1 minute | Best effort |

Request bodies are read with hard size limits (for example 4 KB for staff sign-in, 48 KB for a chat, 64 KB for a payment webhook, 256 KB for a courier webhook) and refused with 413 once over, without buffering the whole body.

## The AI skin chat

| Risk | Control |
| --- | --- |
| Running up the bill | Sign-in required; ₹0.50 per person per day metered from real usage; 2,000 messages a day site-wide; reply and history length caps; a spend limit set on the Anthropic account |
| Harmful advice | Fixed safety instructions; urgent symptoms detected by the server and the doctor notice sent first regardless of the model |
| Prompt injection ("ignore your rules") | Only user and assistant turns are accepted (the request schema rejects a "system" role or extra fields); the rules sit in the fixed system prompt, which tells the model to ignore such requests |
| Leaking personal data | Nothing is stored; the customer is told not to share personal details |

## Security headers

Set on every response by the middleware and `next.config.ts`:

- **Content-Security-Policy:** scripts only from this site and Cashfree's SDK (`sdk.cashfree.com`); network calls only to this site, Cashfree and Sentry; frames only from Cashfree; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
- **Strict-Transport-Security**, **X-Content-Type-Options**, **X-Frame-Options**, **Referrer-Policy**, **Cross-Origin-Opener-Policy**.
- **Permissions-Policy:** camera, microphone and location denied everywhere, except camera on `/scan` only.

> **Known trade-off.** The CSP allows inline scripts, because almost every page is pre-built and a per-request nonce would block the scripts Next.js emits. React's escaping is the defence against inline injection. If the site moves to mostly per-request rendering, switch to a nonce.

## Secrets

- All secrets live in Vercel's environment settings, never in the code or the browser bundle. Only variables starting `NEXT_PUBLIC_` reach the browser, and none of those is secret.
- `AUTH_SECRET` (customer sessions) and `SESSION_SECRET` (staff sessions) must be different. `npm run check:env -- --production` fails if they match, and never prints a secret value.
- Generated local test values live in `.env.acceptance.local`, which is git-ignored.

## What is still open

| Gap | Risk | Action |
| --- | --- | --- |
| No web application firewall | A determined scraper or a flood of traffic is limited only by the application's rate limits | Turn on Vercel Firewall (Bot Protection; Attack Challenge Mode when under attack), or put the domain behind Cloudflare with its managed rules |
| Nightly backup not running | Only 6 hours of history to recover from | Set the six `BACKUP_*` secrets (Chapter [[launch]]) |
| Neon database password | It has appeared in tool output during development | Rotate it in Neon and update `DATABASE_URL` in Vercel |
| WhatsApp token blocked | Owner alerts fail (email still works) | Renew the token in Meta's developer console |
| Inline scripts allowed by CSP | See above | Move to nonces if rendering becomes dynamic |
| No alerting channel | Problems are visible in the owner console and logs, but nobody is paged | Configure Sentry (`SENTRY_DSN`) and an alert rule |

# Privacy and data protection {#privacy}

This chapter lists what personal data the shop holds, why, who else receives it, and how long it is kept. It describes the system; it is not legal advice. India's Digital Personal Data Protection Act 2023 and the IT Rules apply to an online shop, and the policy wording should be reviewed by a lawyer before launch.

## What is collected, and why

| Data | When | Why | Where |
| --- | --- | --- | --- |
| Name, email, phone, delivery address | Checkout | To deliver the order and contact the customer about it | `orders`, `addresses` |
| Order contents and amounts | Checkout | The record of the sale, tax and accounts | `orders`, `order_items` |
| Google account email and name | Google sign-in | To create and identify the account | `users`, `accounts` |
| Password (hashed only) | Password sign-up | Sign-in | `users` |
| Sign-in codes (hashed only) | Code sign-in | Sign-in; deleted after use or expiry | `otp_codes` |
| Bag and wishlist | Signed-in shopping | To keep them across devices | `carts`, `cart_items`, `wishlist_items` |
| Quiz answers and saved routines | Only if the customer allows saving | To show the routine again | `skin_profiles`, `routine_results` |
| Face photo | Only if the scan feature is on and the customer consents | Analysis (not available) | Private storage, at most 24 hours |
| Reviews, support messages | When submitted | To publish the review; to answer the message | `reviews`, `support_requests` |
| Chat messages | AI skin chat | To produce a reply | **Not stored** by Avyora; sent to Anthropic for the reply |
| Anonymous usage events | Browsing | Analytics: aggregate skin type and concern counts, page use | `activity_events` |
| Network address | Every request | Rate limits | Stored only as a keyed hash, never the raw address |

## Permissions (consent)

Anything beyond what an order needs is saved only with a recorded permission:

| Permission | Covers | Withdrawn by |
| --- | --- | --- |
| `routine_saving` | Saving quiz answers and routines | Account → Routines → withdraw; saved routines stop being shown at once |
| `photo_processing` | Uploading a face photo (feature switched off) | Account → withdraw; the photo is deleted immediately |
| `model_research` | Use in future research (not used) | — |

Each grant is stored with the policy version the customer agreed to, in an append-only table: a permission is never edited, only withdrawn and, if given again, granted anew. The database itself refuses to save a routine or scan without a live permission from the same owner.

## How long data is kept

| Data | Kept for | How it is removed |
| --- | --- | --- |
| Guest routine | 30 days | Daily sweep |
| Account routine | 180 days | Daily sweep |
| Face photo | At most 24 hours (a database rule) | Deleted on completion, failure or withdrawal; sweep retries failed deletes |
| Scan observations | At most 7 days | Daily sweep |
| Unconfirmed newsletter sign-up | 7 days | Daily sweep |
| Sign-in codes | Usable for 10 minutes; the row is deleted a day after expiry | Daily sweep (scheduled from 21 October 2026; the clean-up existed but was never run before) |
| Rate-limit counters | One day after their window | Daily sweep |
| Orders and invoices | No automatic deletion | Needed for tax and accounts; the period is an owner decision (see below) |
| Support requests | Proposed 12 months after closing | **Not implemented**: needs the owner to confirm the period |
| Consent records | Kept as the audit of permissions | Period for owner and legal review |
| Chat conversations | Not stored | Exist only in the open browser tab |

## Who else receives data

| Service | Receives | Purpose |
| --- | --- | --- |
| Cashfree | Order number, amount, customer name, email, phone | Taking payment |
| Shiprocket and its couriers | Name, address, phone, email, items, amount (for COD) | Delivery |
| Gmail or Resend | Email address and message content | Sending order emails and codes |
| Meta (WhatsApp) | Order number, total, item count, city (owner alerts only; no customer name) | Telling the owner about orders |
| Anthropic | Chat messages | Producing the AI reply |
| Google | Sign-in only | Google sign-in |
| Neon, Vercel | Everything stored or processed | Hosting |
| Open-Meteo | A region derived from the PIN code, never the address | Weather notes |
| Sentry (if enabled) | Error reports, after redaction | Error monitoring |

## Customer rights in practice

| Request | How it is handled today |
| --- | --- |
| See my data | Account → Data shows what is held and the permissions granted |
| Delete my saved routines | Account → Routines → delete, or withdraw the permission |
| Delete my account | **No self-service button yet.** The database is built for it: deleting a user removes their permissions, saved answers, routines, scans and feedback in one cascade, and keeps their orders (needed for accounts) detached from the account. Until a button is built, the owner handles requests by email and a developer runs the deletion |
| Correct my details | Addresses are editable in the account; order addresses are frozen as the record of delivery |
| Complain | The grievance officer named on the policy pages |

## Safeguards built into the system

- Passwords, codes, guest secrets and network addresses are stored only as hashes.
- Logs and error reports are redacted before anything is written (Chapter [[security]]).
- Private pages are never cached by the CDN or a shared browser cache.
- Face photos are re-encoded on upload, which strips location and camera data.
- Staff screens show only what each role needs: the manager sees delivery details, not revenue; review moderation shows the text, not the reviewer's contact details.

## Owner decisions still needed

From `docs/legal-facts-needed.md`:

1. **Grievance officer:** a named person, with email and address, published on the policy pages. The law expects complaints acknowledged within 24 hours and resolved within 15 days.
2. **Registered entity details:** name, address and GSTIN for the terms, privacy and contact pages.
3. **Retention periods** for order records and support messages.
4. **A self-service "delete my account" button**, if wanted (a small piece of work, since the database already cascades).
5. **Return window for cosmetics:** most Indian direct-to-consumer brands accept returns only on unopened items for hygiene reasons; whatever is chosen must be stated plainly.
6. **Who pays return shipping.**
7. **Labelling compliance:** cosmetics sold in India need a manufacturing licence under the Cosmetics Rules 2020, and Legal Metrology rules require net quantity, MRP, batch number and expiry on the label. A labelling failure means a recall.

