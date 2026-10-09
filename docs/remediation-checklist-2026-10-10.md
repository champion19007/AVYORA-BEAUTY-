# Re-audit remediation checklist — 10 October 2026

The single checklist for the 9 October desktop re-audit (`docs/avyora-desktop-re-audit-2026-10-09.md`, A01–A22) and the brief's five phases. The re-audit itself is unchanged and remains a dated record.

**State legend:**
- **Confirmed**: the issue reproduced on the current code before the change.
- **Fixed**: change made and verified.
- **Partly**: fixed in code; something outside code remains.
- **Dependency**: cannot be completed without owner data, assets or a model.

Evidence uses synthetic data only. `docs/audit-2026-10-09/reproduce.mts` was re-run after the changes; its results are quoted below.

## Phase 1 — Recommendation correctness

| ID | Before | Change | Files | Verification | Remaining |
| --- | --- | --- | --- | --- | --- |
| A01 Owned products bypass actives and allergy | Confirmed (owned retinol "moisturiser" scheduled 14×; unknown cream used against a declared allergy) | One ingredient-based validator for catalogue **and** owned items:<br>• actives detected from canonical ingredient classes<br>• allergy cleared only by a complete, fully resolved list<br>• prescription-only ingredients and items marked prescribed are never scheduled<br>• an active without an approved usage profile is never scheduled<br>Ineligible owned items are listed with reasons | `personalization/core/eligibility.ts` (new), `selection.ts` | `audit-regressions.test.ts` (4 cases); re-run script: 0 uses, allergy slot not filled by the unknown item | Active classes are product categorisation pending clinician review (as before) |
| A02 Conflicting plan actionable and saveable | Confirmed (28 conflicting placements, status partial) | The planner removes a conflicting placement (the customer's own product stays) and records why. Anything still broken returns `invalid`: no days, no purchases. The route **and** the persistence boundary refuse `invalid`/problem plans. The UI shows an invalid plan with no save, totals or bag | `planner.ts`, `api/routines/route.ts`, `personal/routines.ts`, `results-view.tsx` | `planner.test.ts` (3 new; old "conflict + partial" test replaced), `audit-regressions.test.ts` | — |
| A03 INCI count, not identity | Confirmed ("Niacinamide" INCI vs "Aqua" row passed; product chosen for a niacinamide allergy) | Each declared entry is compared with its ordered row; commas inside names (1,2-Hexanediol) are kept; a resolvable label must carry its canonical id; unresolved entries keep identity `partial`, so allergies cannot be cleared. Dictionary gains water and glycerin (identity only) | `ingredients/formulations.ts`, `dictionary.ts`, `eligibility.ts` | Re-run script: refused with both messages; product not selected; `audit-regressions.test.ts` (4 cases) | Real onboarding needs a dictionary entry for every declared ingredient |
| A08 Usage limits only for treatments | Confirmed (PM-only, 2×/week cleanser scheduled 14×) | Every catalogue product with an approved usage profile is placed and validated by it (session, weekly maximum, introduction pace), whatever its role. Others are marked `role_default`. Owned actives are never given a frequency | `planner.ts` | Re-run script: 2 uses, PM; `audit-regressions.test.ts` | Approved directions are owner/reviewer data (none yet) |
| A09 Experience/adherence disconnected | Confirmed | Versioned adapter (`answers-v2-adapter-1`): experience mapped to `experienceLevel`, adherence and nursing exposed as rule fields, and every question's purpose recorded. Proposed **draft** rule `low_adherence_essentials_first` (inactive until reviewed) | `core/answer-adapter.ts` (new), `routine.ts`, `knowledge/predicate.ts`, `data/knowledge.ts` | Re-run script: fixture release applies `beginner_no_treatments` and the adherence rule, and schedules now differ; purpose-coverage test | Rules stay drafts until a reviewer approves them |
| A10 No quiz evidence adapter | Confirmed | Quiz answers become canonical evidence (`concern_<id>` binary, skin type categorical). Photo groups are mapped onto the same groups, so correlated evidence counts once; missing answers add nothing. Tested through `computeRoutine` | `answer-adapter.ts`, `routine.ts` | Synthetic parameter: posterior 0.20 → 0.4286; photo duplicate adds nothing | No validated production parameters exist |
| A11 Invalid categorical distributions publishable | Confirmed (0.6 + 0.8 accepted) | Groups with one row are binary. Groups with several states must be declared `categorical`; both distributions must sum to 1; no duplicate states; `unknown` is not a state. Enforced at compile **and** at runtime reading | `bayes.ts` (`likelihoodGroupProblems`), `compile.ts`, `records.ts` | Re-run script: refused; `audit-regressions.test.ts` | — |
| A12 Greedy budget misses a feasible core | Confirmed (₹300 → partial) | Bounded exhaustive search, at most 10³ combinations. Ranked by: most roles filled, then more important roles, then score, then price, then SKU id. Optional items only after the core | `selection.ts` (`feasibleCore`) | Re-run script: complete at ₹300; selection tests | — |
| Explanations from the decision trace | — | `answersThatMattered` derived from actual exclusions, owned-item reasons, unfilled reasons and applied rules. Shown as "What shaped this routine", alongside "Your products we did not schedule" | `routine.ts`, `results-view.tsx` | Test, and browser (database-backed) | Customer wording of rule reasons needs approved templates |

## Phase 2 — Privacy and resilience

| ID | Before | Change | Files | Verification | Remaining |
| --- | --- | --- | --- | --- | --- |
| A04 Linked skin telemetry | Confirmed (skin type and concern stored with the account or cookie id) | A bare count, with no answers and no identifiers. `routine_completed` removed from the browser activity allowlist | `routine-finder/actions.ts`, `page.tsx`, `api/activity/route.ts` | Typecheck; code review | **Owner:** decide whether to scrub existing rows, e.g. `UPDATE activity_events SET props = NULL, user_id = NULL, anonymous_id = NULL WHERE name = 'routine_completed';` (not run anywhere) |
| A05 Messages and stacks bypass redaction | Confirmed | Whole error envelope scrubbed (message, stack, extra); Sentry receives a scrubbed copy; `beforeSend`/`beforeBreadcrumb` scrub at full depth on server and client; `logEvent` messages scrubbed; personal-data paths use `reportError` | `lib/observability.ts`, `instrumentation*.ts`, five routes and modules | Re-run script: no leak; `observability.test.ts` (3 new) | — |
| A06 Daily sweep cannot meet 24 h | Confirmed | While no analysis can run, the photo is deleted **in the upload request**. Lateness is measured (`maxLatenessMinutes`). A retention-only endpoint `/api/cron/scan-retention` exists for an hourly scheduler. The customer promise now matches: "deleted as soon as the check ends; failed deletes retried; you can delete it yourself". Orphan cleanup added | `scans/sessions.ts`, `api/scans/[id]/upload`, `api/cron/scan-retention` (new), `scan-flow.tsx` | `sessions.integration.test.ts`; browser: scan ended `failed`, no key, no file | **Before enabling inference:** an hourly scheduler (Vercel Pro or external) |
| A07 Delete UI loses session on failure | Confirmed | Revoke first, then delete. `photo: deleted / pending`; 202 when storage did not confirm. The UI keeps a retry and never says "deleted" without confirmation; 429, network and failure messages. Consent withdrawal reports pending photos. Privacy actions (status, delete) work with admission flags off | `sessions.ts`, `api/scans/[id]`, `scan-http.ts`, `api/consent`, `scan-flow.tsx`, `routine-actions.tsx` | Tests: failed storage gives pending then retry; no storage gives pending | — |
| Separate consents | — | Routine saving, photo processing and newsletter (marketing) each have their own record and wording; none implies another | Existing plus copy | Code review | — |

## Phase 3 — Optional scan infrastructure

| ID | Before | Change | Verification | Remaining |
| --- | --- | --- | --- | --- |
| A13 Concurrent uploads delete the winner's photo | Confirmed (`reproduce-scan.mts`) | Each request writes its own staged key (`<id>.<nonce>.jpg`); only the atomic `created`→`uploaded` winner is kept; a loser deletes only its own object; unreferenced objects are swept after 15 minutes | `sessions.integration.test.ts`: one winner, winner's bytes stored, no untracked object | The audit script still checks the old fixed key, so its `storedPhotoExists: false` is now expected |
| A14 Network and camera lifecycle | Confirmed | Bounded requests (20 s); abort and stale-response guard per operation; tracks stopped on replacement, file choice, leaving capture and unmount; "Cancel and retake"; recoverable connection errors; processing state with bounded polling and "Stop waiting" | Typecheck; browser upload path | Uses `AbortSignal.any` (Chrome 116+, Safari 17.4+) |
| A15 Upload larger than the platform accepts | Confirmed | 4 MB browser and server cap (Vercel limit 4.5 MB); 413 handled | `image-pipeline.test.ts` limit test | — |
| Result → routine flow | — | A completed scan hands `?scan=<id>` to the routine finder; saving sends it; the server reads owned observations only. The preview says it is quiz-only | Session test; code | Inference disabled: **no licensed, evaluated model, no hosted private storage** |

## Phase 4 — Desktop journeys

| ID | Before | Change | Verification | Remaining |
| --- | --- | --- | --- | --- |
| A16 Nuvé replica incomplete | Confirmed | Image slots and crops documented (`docs/product-onboarding.md` §4); long testimonial clamped with a full-review link | Acceptance pass at 3 widths | **Dependency:** approved photography and licensed packshots; replace the wrong-brand stock photo |
| A17 "₹1" delivery text | Confirmed | `DELIVERY_SHORT` built from constants; no punctuation parsing | `money.test.ts` | — |
| A18 Search and filters removed | Confirmed | Header search dialog with category and concern entry points; shop search, category and concern filters, sort, URL persistence, clear-all, useful empty states; keyboard-visible card arrows | Browser (database-backed): search, filter, URL | — |
| Comparison | — | `/compare` (up to 3): current prices, unit price per 10 ml / 10 g / item, stock, routine step, verified-or-not formulation and directions, genuine reviews | Browser; `unit-price.test.ts` | — |
| A19 Ratings ignore reviews | Confirmed | Listing ratings and "Top rated" come from published aggregates; the sort is hidden until reviews exist; JSON-LD from the same source | Browser: publish, then card shows 4 (1 review), sort appears, product JSON-LD 4/1; `reviews.integration.test.ts` | — |
| A20 Homepage canonical everywhere | Confirmed | Root canonical removed; per-page canonicals (home, collections, product, journal, legal, assistant, routine finder); `X-Robots-Tag: noindex, nofollow` on private, token and internal routes | `rendering-policy.test.ts`; browser product canonical | — |
| A21 Newsletter claims delivery after failure | Confirmed | Confirmation sent by a retrying outbox job; the token is issued at send time; the response promises nothing about delivery | `newsletter.integration.test.ts` (2 new) | **Dependency:** email provider and sending service |
| A22 Saved routines keep old quotes | Confirmed | On reopening: a fresh quote, every price change and unavailable item listed, unavailable items not addable, totals at current prices, saved schedule untouched, "Find alternatives" | `routine-session.integration.test.ts`; browser (₹349 → ₹599, sunscreen out of stock) | — |
| Empty and sample catalogue | — | `NEXT_PUBLIC_CATALOGUE_MODE`: `sample` (labelled; production orders refused unless `ALLOW_SAMPLE_ORDERS=1`) or `verified` (empty until onboarding, honest empty states) | Both modes built; verified mode serves 200 with empty states, product 404 | **Owner:** choose the mode for the next deploy |
| Error and retry states | Partly found | Tracking outage message; checkout notice when orders are closed | Code | — |

## Phase 5 — Onboarding and knowledge

| Item | Change | Verification |
| --- | --- | --- |
| Validated product records and preview | `modules/catalog/onboarding.ts`, `npm run catalogue:validate`, admin → Onboarding (read-only) | `onboarding.test.ts` (9) |
| Drafts and unresolved safety never silently recommended | Drafts not publishable; unresolved identity means not recommendable; treatments without directions not recommendable; release compiles approved records only | Tests |
| Bayesian provenance | `validated` needs versions and counts; categorical validity enforced | Tests |
| Education | Existing approved-answer retrieval with aliases, sources and "cannot answer" | Existing assistant tests |

## Defects found during the database-backed browser pass (fixed)

| Defect | Fix |
| --- | --- |
| **Review moderation deleted instead of publishing.** The decision came from the clicked button, and the action defaulted to "reject" (delete) when it was missing | One form per decision with a hidden field; an unknown decision does nothing |
| **COD orders could never be dispatched.** `pending` allowed only cancel, even after release | A released COD order (`payment_provider = 'cod'`, `fraud_status = 'approved'`) may be packed; test added |
| **Guest routines missing on `/account/routines` after sign-in.** The claim ran only in API routes | The page claims guest records first (atomic, idempotent) |
| **Sample notice covered the footer wordmark** | Hides while the footer is visible; the footer carries the notice |

## Not verified

- **Razorpay sandbox:** no test keys exist here. Cash on delivery was placed end to end. Duplicate requests and payment recovery are covered by the existing integration suites.
- **Real webcam capture:** the browser pane blocks cameras.
- **Hosted inference:** disabled by design.
- **Field performance:** needs the deployed site.
