# Security

What is in place, what it actually protects against, and what it does not.

## Scraping: what is honestly achievable

A public storefront cannot be made unscrapable. Anything a browser can render,
a script can read. Worse, the more aggressively you block automation, the more
likely you are to block Googlebot — and losing organic search traffic would
cost far more than scraping does.

So the goal here is not prevention. It is making bulk extraction slow and
expensive while leaving customers and search engines untouched.

| Measure | Effect |
| --- | --- |
| User-agent blocking | Refuses `scrapy`, `python-requests`, `wget`, `sqlmap`, `nikto`, SEO crawlers. Trivially bypassed by changing the UA — it removes the lazy majority, not a determined scraper. |
| Rate limiting | 120 page requests per minute per IP. Normal browsing is nowhere near it; sequential catalogue pulls are. |
| Search-engine allowlist | Checked **before** blocking, so no rule change can accidentally deindex the shop. |

A determined scraper using a headless browser and rotating IPs will still get
the catalogue. The real defence at that level is an edge WAF with bot
management (Cloudflare, or Vercel's Bot Protection), which sees traffic across
many sites and can fingerprint clients. That is a configuration decision, not
application code.

## SQL injection

Structurally prevented, and tested rather than assumed.

All queries go through Drizzle's query builder or its `sql` tagged template,
both of which send values as bound parameters. There is no string-concatenated
SQL anywhere in the codebase — `grep` for `sql.raw` returns nothing.

`src/lib/__tests__/sql-injection.test.ts` runs classic payloads (`'); DROP
TABLE`, `' OR '1'='1`, `UNION SELECT`) through both paths against a real
Postgres engine and asserts they are stored as literal text, the table still
exists, and an embedded `DELETE` does not run.

## Payments

Three properties, in order of importance:

1. **The amount is computed on our server** from the catalogue. The browser
   sends product ids, sizes and quantities only. A client-supplied amount would
   let anyone pay ₹1 for a full basket.
2. **A payment is never trusted because the browser said so.** The checkout
   callback is signature-verified against the key secret, and the captured
   amount is re-read from Razorpay and compared with the order total.
3. **The webhook is authoritative.** A browser callback can be lost to a closed
   tab; the money must not depend on it. Both paths are idempotent, since
   webhook delivery is at-least-once.

Signature comparison is constant-time. The webhook hashes the raw request body,
because re-serialising parsed JSON changes the bytes and invalidates every
signature — there is a test for exactly that.

## Authentication

Two separate systems, deliberately:

- **Admin** — a single operator credential in environment variables. PBKDF2-SHA256,
  210k iterations, per-password salt, constant-time comparison. Access carried
  by an HMAC-signed httpOnly cookie that middleware verifies before any admin
  route renders. Rate limited to 5 attempts per 15 minutes.
- **Customers** — Auth.js with Google, database-backed sessions so a session can
  be revoked server-side, which a stateless JWT cannot do.

Both **fail closed**: an unconfigured deployment rejects every login rather than
accepting any.

## Order confirmations

`/orders/AVY-XXXXXX` shows a customer's name, address and phone. Access requires
either the signed-in owner or a signed token bound to that specific order
number. A token for one order cannot be replayed against another.

## Content Security Policy

**Not nonce-based, and the reason matters.** A per-request nonce is stronger —
it lets `script-src` drop `'unsafe-inline'`. But a nonce must be stamped into
the HTML per request, and almost every page here is statically prerendered at
build time. Attempting it blocks every script Next emits and the site renders
blank; this was confirmed in a browser, not assumed.

The trade is deliberate: static rendering is what makes the site fast and what
put the product copy in front of search engines. What the policy still buys:

- Scripts may only load from this origin and Razorpay, so a stored-XSS payload
  cannot exfiltrate to an attacker's host
- `object-src 'none'`, `base-uri 'self'` — closes two common bypasses
- `form-action 'self'` — an injected form cannot post off-site
- `frame-ancestors 'none'` — no clickjacking
- `connect-src` — limits where fetch/XHR can send data

The remaining gap is inline execution, mitigated by React escaping interpolated
values. The one `dangerouslySetInnerHTML` is the product JSON-LD, which
serialises our own catalogue, not user input.

If the site later moves to mostly dynamic rendering, switch to a nonce.

## Cross-site request forgery

Server Actions carry Next's own origin check. Route handlers do not, so each
state-changing handler compares `Origin` against `Host`. Origin is used rather
than a custom header because it is one of the few values a page cannot forge.

## Other headers

`Strict-Transport-Security` (2 years, preload), `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (camera, microphone,
geolocation denied), `Cross-Origin-Opener-Policy`.

## Dependencies

Next was upgraded from 15.3.8 to 15.5.24 as part of this work. The version in
use carried a long list of advisories, one of which mattered a great deal here:
**Middleware / Proxy bypass in App Router applications**. The `/admin` gate runs
in middleware, so that advisory defeated it outright. Also patched: several
SSRF, cache-poisoning and denial-of-service issues in the image optimiser and
Server Actions.

`npm audit` runs in CI on every push and pull request.

## Error monitoring

Two layers:

1. **Structured JSON to stdout, always on.** No account, no vendor, no
   configuration. Vercel collects it today; CloudWatch will collect it
   unchanged after the AWS move, so this layer survives the migration.
2. **Sentry, only when `SENTRY_DSN` is set.** The SDK is imported lazily and
   never initialises without a DSN, so nothing is sent and no monitoring code
   runs on deployments that have not opted in.

Everything passes through `redact()` first. Logs are the classic place personal
data leaks — retained longer than the data itself, copied into third-party
services, and read by more people than the database is — so credentials, email,
phone, address and card fields are masked before anything is written or sent.

Session replay is deliberately disabled. It records what customers type, which
on a checkout page means their address and phone number.

`error.tsx` catches route errors; `global-error.tsx` catches failures in the
root layout itself, which `error.tsx` cannot because the layout that would
render it is the thing that failed.

## Web application firewall

Not configured, and not something application code can do — it needs account
access.

**Vercel** (current host): Project → Firewall → enable **Bot Protection** and
**Attack Challenge Mode** if under active abuse. Add a custom rule rate-limiting
`/api/*` if you want a second layer under the application limits.

**Cloudflare** (works on Vercel now and on AWS later, so it is the more
portable choice): put the domain behind Cloudflare, enable **Bot Fight Mode**,
turn on the **OWASP managed ruleset**, and add a rate-limiting rule on
`/api/payments/*`.

**On AWS**: AWS WAF in front of CloudFront, with the `AWSManagedRulesCommonRuleSet`
and `AWSManagedRulesKnownBadInputsRuleSet` managed groups.

A WAF is what actually stops a determined scraper with rotating IPs, and the
only practical defence against volumetric denial of service. The application
rate limits are a complement to it, not a replacement.

## Known gaps

- **No WAF.** The single highest-value addition for bot and DDoS defence.
- **No WAF.** Still the single highest-value addition; see below.
- **One known high advisory**: postcss 8.4.31, bundled inside Next and fixable
  only by upgrading to Next 16 (a breaking major). Exploiting it needs
  attacker-controlled CSS input; all CSS here is authored by us. CI therefore
  blocks on critical advisories only. Revisit when Next 16 is adopted.
- **Rate limiting fails open.** A limiter that takes checkout down when its own
  counter table hiccups causes more damage than the abuse it prevents — but it
  does mean a database outage removes the limits.
- **Inline scripts are permitted** by CSP, as described above.
