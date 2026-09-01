# Deploying to production

The app is portable by design: a standard Postgres connection string, a
self-hosted auth library, and no platform SDKs. Moving from Vercel to AWS later
is a change of environment variables and a Dockerfile, not a rewrite.

Run this before anything else, and again after setting variables:

```bash
npm run check:env -- --production
```

It reports what is missing or malformed and exits non-zero if the deploy would
break. It never prints a secret value — only lengths and shapes — so its output
is safe to share.

---

## 1. A database Vercel can reach

The single most common mistake is copying the local `DATABASE_URL` into
production. A hosted deployment cannot reach a Postgres container on your
laptop; the preflight fails the deploy on exactly this.

Create one at [neon.tech](https://neon.tech) (free tier is enough to launch),
then take the **pooled** connection string — its host contains `-pooler`:

```
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Use the pooled one. Serverless functions open many short-lived connections and
will exhaust a direct Postgres connection limit under load. The preflight warns
if it sees a Neon URL without `-pooler`.

Apply the schema once, from your machine, pointed at the production database:

```bash
DATABASE_URL='<production-url>' npm run db:migrate
```

Optionally create stock rows. A SKU with no inventory row is treated as
unlimited, so the shop works either way — stock control is opt-in:

```bash
DATABASE_URL='<production-url>' npm run db:seed-inventory 25
```

## 2. Environment variables

Vercel → Project → Settings → Environment Variables, scope **Production**.

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Neon, pooled string (step 1) |
| `AUTH_SECRET` | **Generate a new one** — must differ from local |
| `AUTH_GOOGLE_ID` | Same Google client as local |
| `AUTH_GOOGLE_SECRET` | Same Google client as local |
| `ADMIN_USERNAME` | Same as local |
| `ADMIN_PASSWORD_HASH` | Same as local, or a fresh `scripts/hash-password.mjs` |
| `SESSION_SECRET` | **Generate a new one** — must differ from local |
| `RAZORPAY_KEY_ID` | Razorpay dashboard (optional; without it, COD only) |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Webhooks |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Sentry (optional) |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`AUTH_SECRET` and `SESSION_SECRET` must be different values. One signs customer
sessions, the other signs admin session cookies; sharing a value means one leak
costs both. The preflight fails if they match.

## 3. Google OAuth

The production redirect URI must already exist on the OAuth client, character
for character:

```
https://avyora-beauty.vercel.app/api/auth/callback/google
```

A trailing slash, a missing path, or `http` instead of `https` all produce
`redirect_uri_mismatch` — the most common launch-day failure.

While the app's publishing status is **Testing**, only accounts listed under
Audience → Test users can sign in. Everyone else is refused. Publish the app
when you want real customers, which for basic profile and email scopes needs no
Google review.

## 4. Razorpay

Payments are optional. Without keys, checkout still works and offers cash on
delivery only.

When you do enable them, `RAZORPAY_WEBHOOK_SECRET` is not optional — the
preflight treats a missing webhook secret as a blocking problem while payments
are on. The webhook is the authoritative record of payment: the browser
callback can be lost to a closed tab or a dead connection, and money must not
depend on it.

Webhook: `https://YOUR-DOMAIN/api/webhooks/razorpay`, events
`payment.captured` and `payment.failed`.

Live keys require completed KYC, and Razorpay reviews the policy pages during
activation. The five pages under `src/app/(legal)/` still contain
`[TO CONFIRM]` markers that must be filled in first.

## 5. After deploying

Verify in this order — each depends on the one before:

1. The homepage renders.
2. `/api/auth/session` returns `200`, not `500`. A 500 means `AUTH_SECRET` is
   missing or the database is unreachable.
3. Sign in with Google, then check a row appears in `users`.
4. Save an address at `/account/addresses`.
5. Place a cash-on-delivery order and confirm the row lands in `orders`.

## Known limits

**Browse rate limiting is per-instance.** Middleware runs in the Edge runtime,
which has no TCP sockets, so its counter is in memory rather than Postgres —
each isolate keeps its own tally and a cold start resets it. It is a speed bump,
not distributed-scrape defence; the CDN/WAF layer is the real answer, see
`docs/security.md`. The limits that must actually hold — admin sign-in,
checkout, payment creation — use the durable Postgres counter from Node-runtime
handlers, where it works and is shared across instances.

**The wishlist is per-device.** It lives in `localStorage`, so it does not
follow a customer to another browser. Moving it server-side is straightforward
— the `users` table and session are already there — but has not been done.

**Stock is opt-in.** SKUs without an inventory row are treated as unlimited.
