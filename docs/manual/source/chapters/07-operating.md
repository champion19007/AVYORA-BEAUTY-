::part Operating the system
Deploying and configuring, how far the system scales, how to watch it and recover from problems, and how it is tested.

# Deployment and settings {#deploy}

## Environments

| Environment | Address | Database | Used for |
| --- | --- | --- | --- |
| Local development | http://localhost:9002 (`npm run dev`) | Whatever `.env.local` points at | Day-to-day development |
| Local acceptance | http://localhost:9006 (`acceptance` launch entry) | A disposable Postgres in Docker (`avyora-acceptance-db`, port 5435) | Full checks with a real database and test data; needs Docker Desktop running |
| Redesign review | http://localhost:9003 / 9004 | None (deliberately empty) | Reviewing the design without touching data |
| Preview | Vercel preview URLs, one per branch | A Neon branch (never production) | Checking a change before it merges |
| Production | https://avyora-beauty.vercel.app | Neon `main` branch | The live shop |

The local launch entries are defined in `.claude/launch.json`: `dev` (9002), `prod-verify` (3000), `dev-redesign` (9003), `start-redesign` (9004), `acceptance` (9006) and `acceptance-start` (9007).

> **Common mistake.** `.env.local` points at `localhost:5432`. If another project's database container is using that port (as happened on 21 October 2026), local builds and the 9002 server talk to the wrong database and time out. Stop the other container, or point `.env.local` at your own database.

## Deploying to production

1. **Check settings:** `npm run check:env -- --production`. It reports what is missing or malformed and never prints a secret.
2. **Database:** use Neon's **pooled** connection string (the host contains `-pooler`). Apply new migrations, after approval: `DATABASE_URL='<production-url>' npm run db:migrate`, ideally on a Neon branch first.
3. **Stock:** a fresh database sells nothing until stock is counted: `npm run db:seed-inventory 25`, or count in the stockroom.
4. **Merge to `main`.** Vercel builds and deploys automatically. A production build refuses to run without a database, so fallback pages are never published as real.
5. **Verify in order:** the home page renders; `/api/health` answers; `/api/auth/session` returns 200 (a 500 means `AUTH_SECRET` is missing or the database is unreachable); sign in with Google; save an address; place a test order.

## Rolling back

- **Code:** in Vercel, promote the previous deployment (instant). Migrations are additive, so older code runs against the newer schema.
- **A migration:** migrations are additive, so rolling back the code is usually enough. Migration 0014 also has a rollback script (`docs/runbooks/0014_catalog_variants.rollback.sql`); rehearse any schema rollback on a Neon branch first and run it in one transaction.
- **A knowledge release:** roll back from `/admin/knowledge`.

## Settings that matter most

The full list of 67 settings is in Appendix C. The essential ones:

| Group | Settings |
| --- | --- |
| Database | `DATABASE_URL` (pooled), optional `DATABASE_READ_URL` |
| Customer sign-in | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Staff sign-in | `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `MANAGER_USERNAME`, `MANAGER_PASSWORD_HASH`, `SESSION_SECRET` (32+ characters, different from `AUTH_SECRET`), `OWNER_TWO_STEP` |
| Email | `GMAIL_USER` and `GMAIL_APP_PASSWORD`, or `RESEND_API_KEY` and `EMAIL_FROM`; `OWNER_EMAIL` |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TO` |
| Payments | `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` |
| Couriers | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_WEBHOOK_TOKEN`, parcel size |
| AI chat | `ANTHROPIC_API_KEY` |
| Jobs | `CRON_SECRET` |
| Shop mode | `NEXT_PUBLIC_CATALOGUE_MODE`, `NEXT_PUBLIC_SITE_URL` |
| Tuning | `RATE_LIMIT_OVERRIDES` (JSON) |

Staff password hashes are generated with `node scripts/hash-password.mjs 'the-password'` (at least 12 characters). The hash is colon-separated, not `$`-separated, because `$` is mangled when environment files are loaded.

## Feature switches

| Setting | Effect when set |
| --- | --- |
| `NEXT_PUBLIC_REDESIGN=1` | The current design (Inter type, measured layout); unset shows the earlier design |
| `NEXT_PUBLIC_CATALOGUE_MODE=verified` | Sell only onboarded, verified products |
| `ALLOW_SAMPLE_ORDERS=1` | Staging only: allow sample orders |
| `NEXT_PUBLIC_FACE_SCAN=1` | Show the optional face-photo page |
| `FACE_SCAN_HOSTED=1` | Allow photo uploads (needs `PRIVATE_STORAGE`) |
| `NEXT_PUBLIC_NEWSLETTER=1`, `NEWSLETTER_ENABLED=1` | Show and accept newsletter sign-ups |
| `OWNER_TWO_STEP=off` | Owner signs in with password only (emergency use) |

## Google sign-in

The production redirect address must be registered on the Google OAuth client exactly: `https://avyora-beauty.vercel.app/api/auth/callback/google`. A trailing slash or `http` instead of `https` causes `redirect_uri_mismatch`, the most common launch-day failure. While the Google app is in **Testing**, only listed test users can sign in; publish it for real customers.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 9002 |
| `npm run build` / `npm run build:offline` | Production build; offline builds without a database (for CI) |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | Code checks |
| `npm test`, `npm run test:coverage` | The test suite, with coverage thresholds |
| `npm run test:stress` | Concurrency tests against a scratch database |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed-inventory <n>` | Give every SKU a stock count |
| `npm run db:check-catalog` | Check catalogue file and database agree |
| `npm run kb -- build / status / publish --confirm / rollback / revoke` | Knowledge releases |
| `npm run check:env -- --production` | Check settings without printing secrets |
| `npm run check:launch` | List launch blockers |
| `npm run catalogue:validate` | Validate product onboarding records |
| `npm run load-test` | Load test a running build |

# Setting up the outside services {#services}

Each service below is set up once, by the owner, in that service's own website. The values it produces go into Vercel under Project → Settings → Environment Variables (scope: Production), and locally into `.env.local`. **Never paste these values into chat, email or the code.** After changing any of them, redeploy (Vercel → Deployments → the latest → Redeploy) so the site picks them up, then run `npm run check:env -- --production` to confirm.

## Neon (the database)

1. Sign in at console.neon.tech and open the Avyora project.
2. **Connection string:** Dashboard → Connect. Choose the **pooled** connection (the host contains `-pooler`). This is `DATABASE_URL`.
3. **Branches for rehearsals:** Branches → Create branch from `main`. A branch is a full copy of production at that moment, cheap and quick. Use one to rehearse a migration or test against real data, and delete it afterwards.
4. **Point-in-time restore:** Branches → Create branch → choose "Past data" and a timestamp. On the free plan the window is 6 hours.
5. **Rotate the password** (recommended now): Roles → the application role → Reset password. Copy the new connection string into `DATABASE_URL` in Vercel straight away, then redeploy; the old password stops working immediately.
6. **When traffic grows:** upgrade the plan for more compute (autoscaling), more storage and a longer restore window. Optionally add a read-only compute and set `DATABASE_READ_URL`.

## Vercel (hosting)

1. **Plan:** Settings → Billing → upgrade to **Pro** before taking real orders. The free Hobby plan forbids commercial use.
2. **Settings:** Settings → Environment Variables. Set each value for Production; preview deployments should use their own Neon branch, never production.
3. **Region:** functions run in `sin1` (Singapore), set in `vercel.json`, next to the Neon database.
4. **Cron:** the schedules are in `vercel.json`. On Pro, change the sweep to `*/15 * * * *`.
5. **Firewall:** Firewall → enable Bot Protection. Under active abuse, turn on Attack Challenge Mode.
6. **Domain:** Settings → Domains → add the shop's own domain when bought. Then update `NEXT_PUBLIC_SITE_URL`, the Google sign-in redirect, and the Cashfree and Shiprocket webhook addresses.

## Google sign-in

1. Go to console.cloud.google.com → APIs & Services → Credentials → Create credentials → OAuth client ID (type: Web application).
2. **Authorised redirect URIs**, exactly:
   - `http://localhost:9002/api/auth/callback/google` (local)
   - `https://avyora-beauty.vercel.app/api/auth/callback/google` (production, and later the shop's own domain)
3. Copy the client id and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
4. OAuth consent screen → **Publish app**. While it is in Testing, only listed test users can sign in. Basic profile and email scopes need no Google review.
5. Generate `AUTH_SECRET` (for example `openssl rand -base64 32`). It must differ from `SESSION_SECRET`.

## Email: Gmail or Resend

The site sends order confirmations, shipping emails, sign-in codes, the owner's two-step codes and the morning summary. Either provider works; if both are set, Gmail is used.

**Gmail (simplest to start):**

1. On the Google account that will send mail, turn on 2-Step Verification (Google Account → Security).
2. Security → 2-Step Verification → **App passwords** → create one named "Avyora".
3. Set `GMAIL_USER` (the address) and `GMAIL_APP_PASSWORD` (the 16-character app password).
4. Limit: about 500 messages a day. Move to Resend before real volume.

**Resend (for volume):**

1. Create an account at resend.com and **verify a sending domain** (DNS records at the domain registrar). Until a domain is verified, Resend only delivers to the account owner's own address.
2. Create an API key; set `RESEND_API_KEY` and `EMAIL_FROM` (an address on the verified domain).

**Owner address:** set `OWNER_EMAIL` to where order alerts, the morning summary and the owner's sign-in codes should go.

## WhatsApp alerts (Meta Cloud API)

1. At developers.facebook.com, create an app of type Business and add the WhatsApp product.
2. Add and verify the sending phone number. Note its **phone number id** (not the number itself): `WHATSAPP_PHONE_NUMBER_ID`.
3. Create a **permanent** access token through a system user in Meta Business Settings, with WhatsApp messaging permission: `WHATSAPP_TOKEN`. Temporary tokens expire within a day, which is the usual cause of "API access blocked".
4. `WHATSAPP_TO`: the owner's number with country code and no plus sign, for example `91XXXXXXXXXX`.
5. **Template:** a business-initiated message outside a 24-hour conversation window must use an approved template, or Meta silently drops it. Create a template for order alerts, wait for approval, and set `WHATSAPP_TEMPLATE` (and `WHATSAPP_TEMPLATE_LANG`, default `en`).

## SMS codes (MSG91, optional)

Indian transactional SMS requires **DLT registration** with TRAI: the business registered with an operator, and each message template approved in advance. Messages from unregistered senders are dropped by the carriers. This takes days to weeks, so treat it as a procurement task.

Once registered, set `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID`. Phone sign-in and the guest checkout phone check then appear automatically; without SMS they stay hidden rather than offering something that cannot send.

## Cashfree (online payments)

1. Sign in to the Cashfree merchant dashboard. Complete **KYC** and payment gateway activation. Cashfree reviews the site's policy pages, so fill in their `[TO CONFIRM]` details first.
2. Developers → API keys: copy the **App ID** and **Secret key** into `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY`. Set `CASHFREE_ENV=production` (or `sandbox` for testing).
3. Developers → Webhooks → add `https://YOUR-DOMAIN/api/webhooks/cashfree` for payment events. The site verifies each one with the secret key.
4. Place one small real order and refund it from the dashboard, to prove the whole path.

## Shiprocket (couriers)

The full steps are in Chapter [[shiprocket]]. In short:

1. Add the pickup address in Shiprocket; note its nickname: `SHIPROCKET_PICKUP_LOCATION`.
2. Settings → API → Add New API User (with a different email from the main login): `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`.
3. Generate a long random token: `SHIPROCKET_WEBHOOK_TOKEN`.
4. Settings → API → Webhooks: `https://YOUR-DOMAIN/api/webhooks/courier`, the same token, enabled.
5. Courier priority (cheapest, fastest, or recommended) is set in Shiprocket's own settings; the site uses whichever courier Shiprocket assigns.
6. Keep the Shiprocket wallet topped up: bookings fail when it is empty.

## Anthropic (the AI skin chat)

1. At console.anthropic.com, create an organisation and add billing.
2. Settings → Limits: set a **monthly spend limit** (for example $5). This is a second safety net behind the site's own ₹0.50 per person per day.
3. API Keys → Create key: `ANTHROPIC_API_KEY`.
4. Usage → watch daily spend in the first weeks.

## Sentry (error alerts, optional)

1. Create a project at sentry.io (platform: Next.js).
2. Copy the DSN into `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.
3. Create an alert rule (for example, email when a new issue appears). Without Sentry, errors are still logged as structured JSON in Vercel; they just do not page anyone.

## Upstash Redis (shared cache, optional)

Only worth adding when traffic grows. Create a Redis database at upstash.com in a Singapore region, and copy its REST URL and token into `REDIS_REST_URL` and `REDIS_REST_TOKEN`. Losing Redis only costs speed, never correctness.

## Nightly backups

1. Create a **private** S3-compatible bucket (Cloudflare R2, AWS S3 or similar), separate from any media bucket, with a lifecycle rule that deletes objects after 30 days.
2. Create an access key limited to that bucket.
3. In GitHub → the repository → Settings → Secrets and variables → Actions, add:

| Secret | Value |
| --- | --- |
| `BACKUP_DATABASE_URL` | A **direct** (not pooled) Neon connection string |
| `BACKUP_PASSPHRASE` | A long random passphrase. Store it somewhere safe: without it the backups cannot be read |
| `BACKUP_S3_ENDPOINT` | The bucket's endpoint, for example `https://<account>.r2.cloudflarestorage.com` |
| `BACKUP_S3_BUCKET` | The bucket name |
| `BACKUP_S3_ACCESS_KEY_ID` | The access key id |
| `BACKUP_S3_SECRET_ACCESS_KEY` | The secret key |

4. Run the workflow once by hand (Actions → Backup → Run workflow) and check a file appears in the bucket. From then on it runs daily at 02:00 India time.
5. Once a month, restore last night's dump into a scratch Neon branch (Chapter [[runbooks]]) and delete the branch afterwards.

## Staff passwords

1. On a computer with the project: `node scripts/hash-password.mjs 'a-long-new-password'` (at least 12 characters). It prints the hash only; the password itself is stored nowhere.
2. Set `ADMIN_PASSWORD_HASH` (owner) or `MANAGER_PASSWORD_HASH` (manager), and the matching usernames.
3. `SESSION_SECRET`: at least 32 random characters, different from `AUTH_SECRET`. Changing it signs every staff member out.

# Scaling and performance {#scaling}

## How the system scales

- **Servers** scale automatically on Vercel: each request can run on a new instance. There is no server to resize.
- **Public pages** are pre-built and served from Vercel's edge, so readers barely touch the servers and never touch the database.
- **The database** is the first thing to fill up, because checkout, sign-in, carts and rate limits all write to it. Neon can be given more compute with a setting change, and a read replica can take the reporting load.
- **Costly actions are capped** (payments, sign-in, AI chat), so a spike in traffic cannot become a spike in the bill.

## Load test (12 October 2026)

A local production build against a copy of the production database (Neon branch, same 0.25 compute units), 20 seconds per stage:

| Simultaneous visitors | Requests a second | Median | 95th percentile | Errors |
| --- | --- | --- | --- | --- |
| 10 | 147 | 29 ms | 283 ms | 0 |
| 50 | 133 | 92 ms | 1.9 s | 0 |
| 100 | 179 | 266 ms | 3.3 s | 0 |
| 250 | 134 | 876 ms | 6.3 s | 0 |
| 500 | 149 | 2.0 s | 10.5 s | 876 (the laptop's connection limit) |

One local process is not Vercel's capacity. What carries over is the shape: pages are cheap, and the database-bound APIs (cart, sign-in, checkout, rate limiter) are the bottleneck.

## Plan limits

| Platform | Free tier limit | What happens |
| --- | --- | --- |
| Vercel Hobby | Non-commercial use only; 1,000,000 function calls, 4 active-CPU hours and 100 GB transfer a month; scaling by 1,000 instances per 10 seconds | Exceeding a monthly limit pauses that feature until the month resets; a sudden spike gets `503 FUNCTION_THROTTLED` |
| Neon free | 0.25 compute units, 512 MB per branch, 6 hours of history | Slower queries under load; limited recovery window |
| Vercel Cron (Hobby) | Daily jobs only | Abandoned stock waits up to a day |

## What to change, and when

| When | What runs out | Fix |
| --- | --- | --- |
| Before taking real orders | Vercel Hobby is not allowed for commercial use | **Move to Vercel Pro (about $20 a month).** Then set the sweep to every 15 minutes |
| A few thousand customers a day | Neon free compute and storage | Paid Neon plan with autoscaling; longer history |
| Tens of thousands a day | Rate-limit writes on the database | Move rate limits to Redis (one file, `rate-limit.ts`); set the Redis cache settings |
| Hundreds of thousands a day | Database reads | Add a Neon read replica (`DATABASE_READ_URL`) |
| Millions of users | Everything | A dedicated team and a re-architecture; not worth planning for now |

## Performance measured

Public pages: 0 database queries for 14 page requests served from cache; HTML 7 to 20 KB compressed; layout shift 0 on every page at 1280, 1440 and 1920 pixels wide; no accessibility findings in the automated acceptance pass.

# Monitoring, incidents and runbooks {#runbooks}

## Where to look

| Question | Where |
| --- | --- |
| Is the site up? | `/api/health` (checks the database too) |
| Errors in the last hours | Vercel → Project → Logs (Hobby keeps raw logs for 1 hour) or Observability → Errors |
| Stuck emails or jobs | Owner console → System: failed and dead jobs and event deliveries, with Replay |
| Orders needing a decision | Owner console → Orders (held and attention panels) |
| Payment state of an order | The order page in the owner console (payment events listed) and the Cashfree dashboard |
| Parcel state | The dispatch card, and Shiprocket's panel |
| AI chat spend | Anthropic console usage; `chat reply` log lines carry tokens and paise |

Every log line is structured JSON with a request id. An error page shows a reference number (the request's correlation id), which finds the matching log line.

## Runbooks

### The site shows "Something went wrong"

1. Note the reference number on the page.
2. Check `/api/health`. If the database is down, public pages still show products as out of stock; check Neon's status page and the project's compute.
3. Search the Vercel logs for the reference number.
4. If the latest deployment caused it, promote the previous deployment in Vercel.

### A customer paid but the order shows unpaid

1. Open the order; check its payment events.
2. Check the Cashfree dashboard for the order number.
3. If Cashfree shows success, wait for the webhook or the next sweep, which reconciles. Never mark it paid by hand: there is no such button on purpose.
4. If the webhook is failing, check `CASHFREE_SECRET_KEY` and the webhook address in Cashfree.

### A paid order shows "needs attention"

Read the reason. If the stock was sold to someone else: refund in Cashfree, or restock and send. If paid after cancelling: confirm with the customer, then send or refund. Clear the hold with a note saying what was done.

### Order emails are not arriving

1. Owner console → System: look for failed deliveries of the `notifications` consumer and their error.
2. Gmail: check the app password is still valid. Resend: the sending domain must be verified.
3. Fix, then press Replay. Failed sends retry five times on their own first.

### WhatsApp alerts fail with "API access blocked"

The Meta token or app permission has expired or been blocked. Create a new permanent token in Meta's developer console and update `WHATSAPP_TOKEN` in Vercel.

### "Book courier" fails

Read the message on the card. "Pincode not serviceable" means no courier reaches that address: call the customer. Sign-in failures mean the Shiprocket API user's password changed: update `SHIPROCKET_PASSWORD`. The order stays packed; book again when fixed, or send another way and use the manual buttons.

### Parcels are not moving to "On its way"

Check Shiprocket → Settings → API → Webhooks: the address, the toggle, and that the token equals `SHIPROCKET_WEBHOOK_TOKEN`. A 401 in the logs for `/api/webhooks/courier` means the token is wrong; a 503 means it is not set.

### The owner cannot sign in (no code arrives)

Check email delivery works (the same settings as order emails). In an emergency, set `OWNER_TWO_STEP=off` in Vercel, redeploy, sign in, fix email, then remove the setting.

### Restoring the database

Within 6 hours: in Neon, create a branch from `main` at a time just before the incident, check it, then copy the damaged rows back or make it the default and update `DATABASE_URL`.

From a nightly dump (once backups run):

```
aws s3 cp s3://$BUCKET/db/<stamp>.dump.enc . --endpoint-url $ENDPOINT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in <stamp>.dump.enc -out avyora.dump -pass env:PASSPHRASE
pg_restore --no-owner --no-privileges --dbname "$RESTORE_TARGET_URL" avyora.dump
npm run db:migrate
```

Then compare row counts for `orders`, `order_items`, `payment_events` and `inventory` against Cashfree's totals before switching traffic. Rehearse this once a month on a scratch branch.

# Testing and quality {#testing}

## The test suite

| Measure | Value (21 October 2026) |
| --- | --- |
| Test files | 100 (listed in Appendix E) |
| Tests | 1,131 passing, 3 opt-in skipped |
| Integration tests | Run against PGlite, a real Postgres engine compiled to WebAssembly, built from the same migrations as production |
| Run time | About 4 minutes on the development machine |

Integration tests are the backbone. A mocked database would test the mock; these run the real SQL, constraints and triggers that the guarantees rest on. Outside services (Cashfree, Shiprocket, Anthropic, email, WhatsApp) are replaced with fakes that follow their documented APIs.

## How tests are trusted

Important tests are checked by **mutation**: the protection they guard is deliberately broken, and the test must fail. Examples from this project:

- Removing the stock guard (`quantity >= n`) fails four inventory tests, including "twenty attempts against ten units grant exactly ten".
- Letting the courier move an order backwards fails two shipping tests.
- Treating "prefer not to say" on pregnancy as "no" fails three routine tests.
- Alerting the owner when an online order is created (rather than paid) fails a payment test.
- Disabling the urgent-symptom notice fails a chat test.

## Areas and their tests

| Area | Covered by |
| --- | --- |
| Pricing and checkout | Cart, checkout quote, display-matches-charge, idempotency (including the replay-key fix), price-change refusal |
| Stock | Reservation, restoration exactly once, sweep, autopilot |
| Payments | State machine, webhook signatures and dedupe, reconciliation, Cashfree back-out |
| Deliveries | Shiprocket booking (fake API), tracking mapping, forward-only rule, webhook token, returns and COD collection |
| Security | SQL injection payloads, rate limits (including concurrency on real Postgres), body limits, trusted IP, ownership on every personal record, owner two-step sign-in, CSP and camera policy |
| Personalisation | 560-profile routine matrix, selection, planner, inference, knowledge compiler, assistant |
| Content | Claim rules over all customer-facing text, CMS publish checks |
| Outages | Storefront renders during a database outage; checkout still refuses |

## Continuous integration

Every push and pull request runs, on GitHub Actions: install, type check, lint, formatting, the full test suite with coverage thresholds, a runtime dependency audit (fails on high), a build-tools audit (fails on critical), and an offline production build.

## Acceptance checks

`scripts/acceptance-pass.mjs` loads ten key pages at three widths in headless Edge, saves screenshots, and records load timings, layout shift, page weight, horizontal overflow and basic accessibility checks (language, one main heading, heading order, image alternative text, named buttons and links, labelled fields). The last full pass found no accessibility issues, no overflow and zero layout shift.
