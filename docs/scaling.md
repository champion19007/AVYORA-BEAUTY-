# Scaling to 50,000 concurrent visitors

## Where things stand

The storefront itself is now in good shape for that load. Everything below is
what changed, followed by an honest account of what still blocks a real launch.

### Done

**Every storefront page is prerendered to static HTML.** After adding
`generateStaticParams`, the build reports all 27 product pages plus the home,
collections, routine finder and track-order routes as static. Static HTML is
served from Vercel's CDN edge, so 50,000 concurrent readers are absorbed by the
CDN and never reach an application server. This is the single most important
factor and it is in place.

**Catalogue lookups are indexed.** `src/lib/catalogue.ts` builds id, slug,
category and concern indexes once per process. Previously every lookup was a
linear `PRODUCTS.find(...)` repeated per request and per render.

**Static work hoisted out of render.** The header rebuilt a concern `Set` and
scanned the product array on every single render. Both are now module-level
constants.

**The mutable singleton is gone.** `ProductService` held a mutable copy of the
catalogue and exposed `updateProductPrice`. On serverless that is actively
harmful: each instance keeps its own copy, so an edit applies only to the
instance that served the request, is invisible to every other instance, and
vanishes when that instance recycles. Under load, different customers would see
different prices for the same product. Reads are now pure functions; the write
path is disabled pending a database.

**Admin charts are deterministic.** They used `Math.random()`, so the chart
changed on every render and disagreed between server and client — a hydration
mismatch producing numbers nobody could act on. Now seeded from the SKU id.

**Delivery tuning.** AVIF/WebP output, a 30-day optimised-image cache so the
image optimiser is not re-invoked per viewer, long-lived cache headers on brand
assets, `optimizePackageImports` for `lucide-react` / `recharts` / `date-fns`,
and baseline security headers.

## What still blocks a real launch

Serving 50,000 readers and *transacting* with 50,000 customers are different
problems. The site currently does the first, not the second.

### 1. Admin authentication is not real — fix before any public launch

`src/app/(auth)/login/page.tsx` compares the username and password in the
browser. Both values are in the JavaScript bundle every visitor downloads:

```bash
grep -o qwerty .next/static/chunks/app/\(auth\)/login/*.js
```

The gate on `/admin` is also client-side only. Anyone can open the console, set
`localStorage.user` to `{"isAdmin":true}`, and reach the admin panel — no
password needed at all.

This needs real server-side authentication with hashed credentials and a
server-checked session before the site is public. It is not a scaling issue,
but it is the most urgent item here.

### 2. There is no backend

- The cart lives in `localStorage`. It does not survive a device change and the
  server never sees it.
- There is no checkout, no payment integration, no order persistence.
- There is no inventory, so nothing prevents overselling.
- `track-order` has no orders to track.

Static pages scale effortlessly precisely because nothing is written. The
moment real carts, orders and stock exist, the bottleneck moves to that
datastore, and this document's conclusions will need revisiting.

### 3. Product imagery points at `picsum.photos`

Every product photo is fetched from a random-image service. During local
testing this rate-limited and returned 504s, and the hung upstream requests
saturated Next's image optimiser badly enough to stall the dev server.

At 50,000 concurrent visitors this fails outright. Real photography served from
the project's own storage or CDN is required — this is a launch blocker, not a
placeholder nicety.

### 4. Mock data is compiled into the bundle

`src/data/mock-data.ts` is imported directly by client components, so the whole
catalogue ships to the browser. Fine at 27 SKUs; it will not stay fine. Moving
the catalogue behind a data source keeps client payloads flat as the range
grows.

## Suggested order of work

1. Server-side auth for `/admin` (security, urgent)
2. Real product photography on owned storage (launch blocker)
3. Database for catalogue, cart and orders
4. Checkout and payments
5. Inventory and overselling protection
6. Load testing against the real checkout path
