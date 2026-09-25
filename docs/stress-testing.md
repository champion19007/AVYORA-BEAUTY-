# Stress testing

Two kinds, because they find different bugs.

| | Concurrency suite | HTTP load test |
| --- | --- | --- |
| Command | `npm run test:stress` | `npm run load-test -- http://localhost:3000 20` |
| Target | a scratch Postgres (never production) | a local `next build && next start` on a scratch database |
| Finds | broken invariants: oversells, double charges, lost updates, deadlocks | slow paths, bottlenecks, errors under load |

Both refuse to point at live systems. The suite needs
`STRESS_DATABASE_URL` and `STRESS_ALLOW_DESTRUCTIVE=yes-this-is-a-scratch-database`
(it truncates tables); the load test refuses `*.vercel.app` and `avyora.com`.

Why a separate suite: the normal tests run on PGlite, which has one
connection. It can check that an interleaving ends in the right state, but
it cannot make two transactions contend for a row. These tests use a pool of
20 against a real server, so they do.

## Results — 2026-09-25

Scratch Neon branch (PostgreSQL 18.6, ap-southeast-1), run from India
(71 ms round trip to the database).

### Invariants under contention

| Scenario | Result |
| --- | --- |
| 60 simultaneous buyers, 10 units | exactly 10 orders, stock 0, no errors |
| 40 checkouts, same two SKUs in opposite orders | 40 of 40 succeed |
| 30 simultaneous retries with one idempotency key | 1 order, 1 unit reserved |
| 40 webhook deliveries (30 duplicates of one event) | 11 recorded, 1 `order.paid`, order paid |
| 20 simultaneous price saves from the same version | 1 accepted |
| 15 simultaneous publishes of one draft | 1 publish, 1 event |
| 25 simultaneous first cart saves by a new visitor | 1 cart, 1 line |
| 300 jobs, 8 concurrent workers | each ran exactly once |

The opposite-order test was also run against the previous stock-locking
code: **35 of 40 checkouts failed** with Postgres deadlocks. That is the bug
it exists to catch, and it is fixed.

### HTTP load, before and after

Local production build, one Node process, mix of home, listing, search,
product pages, journal and the cart API. Every request from a different
address, so the per-IP browse limit measures nothing here (a separate
single-address burst confirms it engages: 2,592 of 3,032 refused).

| | Before | After |
| --- | --- | --- |
| Throughput at 100 concurrent | 55 req/s | 160 req/s |
| Product page p50 at 10 concurrent | ~130 ms (every view rendered) | 52 ms (cached) |
| Cart API, single unloaded request | 750 ms | 150 ms (returning visitor), 14 ms (new visitor) |
| Errors | 0 | 0 |

What changed:

1. **The database client was not reused in production.** A condition meant
   to apply to development only left production building a new connection
   pool, and a new TLS connection to Neon, for every query.
2. **Every page was dynamic.** The root layout read the session cookie for
   the header's "Deliver to" line, which made the whole site uncacheable.
   The line is now fetched by the browser; pages are cached again.
3. **New visitors' carts** no longer query the database: an id minted on
   this request cannot have a cart.

### What these numbers do not show

- **Production region.** Live responses carry `x-vercel-id: bom1::iad1::…`:
  functions ran in Washington, D.C. while the database is in Singapore,
  roughly 200 ms per query. `vercel.json` now pins functions to `sin1`,
  next to the database; that takes effect on the next deploy. A checkout
  makes about eight queries, so this is the largest single latency gain
  available, and it also shortens how long a popular SKU's stock row is
  locked — the bound on how fast one product can sell.
- **Horizontal scale.** One local process plateaus around 160 req/s. Vercel
  runs as many instances as traffic needs; the limits then are the Neon
  pooler and the 0.25 CU compute on the free plan, not the application.
- **Checkout over HTTP.** Checkout is a server action with its own rate
  limits; its concurrency is covered by the suite above rather than by
  raw HTTP load.
