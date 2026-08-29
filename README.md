# Avyora

Storefront for Avyora, a science-forward clinical skincare brand. Next.js 15
(App Router) with Tailwind, deployed on Vercel.

## Running locally

```bash
npm install
npm run dev
```

The dev server runs on [http://localhost:9002](http://localhost:9002).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on port 9002 |
| `npm run build` | Production build |
| `npm run typecheck` | Type check without emitting |
| `npm test` | Run the test suite |

## Admin access

The admin panel at `/admin` is gated server-side by `src/middleware.ts`, which
verifies a signed session cookie. Credentials come from the environment and are
never bundled into client code.

Generate them with:

```bash
node scripts/hash-password.mjs 'your-admin-password'
```

Then set `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` in Vercel
under Project Settings → Environment Variables. See `.env.example`.

Authentication **fails closed**: with no configuration, every admin login is
rejected and `/admin` is unreachable. That is intended.

## Layout

```
src/
  app/           routes (App Router); (app) and (auth) are route groups
  components/    UI; components/ui is shadcn-style primitives
  data/          catalogue (mock-data.ts)
  lib/           catalogue index, routine engine, auth, store
  services/      product read access
  middleware.ts  admin route protection
public/          brand assets
scripts/         hash-password.mjs
docs/            methodology and scaling notes
```

## Documentation

- [`docs/routine-methodology.md`](docs/routine-methodology.md) — how the routine
  finder decides what to recommend, and the clinical rules behind it
- [`docs/scaling.md`](docs/scaling.md) — what scales today and what still
  blocks a real launch

## Known limitations

The catalogue is compiled in from `src/data/mock-data.ts`; there is no database,
checkout, or inventory, and the cart lives in `localStorage`. Product imagery
currently points at `picsum.photos` and must be replaced with real photography
before launch. See [`docs/scaling.md`](docs/scaling.md).
