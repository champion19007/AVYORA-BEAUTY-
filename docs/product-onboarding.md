# Adding real products

The storefront, routine engine and checkout are ready for verified products. This guide is the gate every product passes before customers see it. Nothing here needs the application rewritten.

## 1. What each product needs

| Field | Rule | Where it lives |
| --- | --- | --- |
| Product id and slug | Lowercase, hyphenated, stable forever | Record `id`, `slug` |
| Variants (SKUs) | SKU code, size label (`150ml`, `20g`, `60 Pads`), **integer-paise** price, optional MRP ≥ price | Record `variants`; live prices and stock in the database (admin → Pricing, Inventory) |
| Formulation | Full INCI **in label order**; each entry resolved to a canonical ingredient id, or explicitly `null` when unknown; concentrations known (value and unit) or explicitly unknown | Record `formulation` |
| Ingredient identities | Every declared ingredient should exist in `src/modules/ingredients/dictionary.ts`. An unresolved entry keeps the product publishable but **not recommendable**, because an unknown entry cannot clear an allergy | Dictionary (identity facts only) |
| Directions | Session, weekly maximum, introduction pace, reviewer, date, source, formulation version. **Required for treatments**; essentials without them use their role's default and say so | Record `directions` |
| Claims | Each claim names evidence ids and states its limitations; absolute or unsupported wording is refused | Record `claims` |
| Verified attributes | Key, value, source id | Record `attributes` |
| Images | Owned or licensed, credited, at least 800×800, with alt text | Record `images` |
| Review | `approved` with reviewer, date and source ids. Drafts are never publishable | Record `review` |

Evidence sources (dossiers, labels, literature) are listed once in `src/data/formulations.ts` (`EVIDENCE_SOURCES`) and referenced by id.

## 2. Validate and preview (nothing is written)

```bash
npm run catalogue:validate -- products.json --evidence evidence.json
```

Or paste the same JSON in **admin → Onboarding**. Each record is reported as:

| State | Meaning |
| --- | --- |
| `BLOCKED` | At least one problem: fix it and run again |
| `PUBLISHABLE (not recommendable)` | May be sold; kept out of routines until its formulation identity is complete (treatments: also approved directions) |
| `READY` | May be sold and recommended |

Unresolved fields are listed for every record, so it is always clear what a product cannot yet be used for. A synthetic example is in `docs/onboarding/example-products.synthetic.json`.

## 3. Publish

1. Commit the reviewed records:
   - the formulation in `src/data/formulations.ts`
   - directions in `src/data/product-directions.ts`
   - the product in `src/data/verified-products.ts`
   - any new dictionary entries

   Each change is a reviewable diff.
2. Set prices and counted stock in admin → Pricing and Inventory (`npm run db:seed-inventory` creates missing rows at zero).
3. Publish the knowledge release (admin → Knowledge, owner only). It compiles only approved records and refuses invalid ones.
4. Build with `NEXT_PUBLIC_CATALOGUE_MODE=verified` so only verified products are shown. Until then the sample catalogue stays labelled and cannot be ordered in production.

## 4. Photography slots (desktop)

All images use `object-fit: cover`, centred. The rendered size at 1440 px is measured from the Nuvē reference. Supply at least the recommended source size; use 2× for crisp 1920 px displays.

| Slot | Rendered (1440) | Recommended source | Notes |
| --- | --- | --- | --- |
| Hero (`components/nv/home/hero.tsx` `HERO_IMAGE`) | 1440×900 (full viewport) | 2400×1350 landscape | Subject centred; top-right and lower-left calm enough for white text |
| About portrait | 392×512 | 800×1050 portrait (3:4) | |
| About card | 388×366 | 800×800 square | |
| Vision | 1440×945 | 2400×1350 | Full-bleed |
| Services | 1440×986 | 2400×1650 | Full-bleed |
| Testimonial centre | 616×515 | 1240×1040 | |
| Image break (sticky) | 1440×945 | 2400×1350 | |
| Consultation | 1440×993 | 2400×1650 | |
| Product cards | 4:5 | 1200×1500 | Real packshots per SKU; no other brand visible |

Landing slots are set in `PHOTO_SLOTS` (`components/nv/home/landing.tsx`).

The sample catalogue's stock photo `photo-1601049541289-9b1b7bbbfe19` shows another brand's label. It must not reach a verified product.

## 5. Knowledge beyond products

| Record | Requirement |
| --- | --- |
| Decision rules (`src/data/knowledge.ts`) | Drafts until a qualified reviewer approves them; drafts never compile into a release |
| Bayesian parameters | Groups with one row are binary events. Groups with several states must be declared `categorical` and sum to 1 under both conditions. `validated` needs training and calibration versions and counts. Never invent numbers |
| Education answers | Question aliases, answer, scope, approved review with sources. The assistant answers only from approved records and says when it cannot answer |
