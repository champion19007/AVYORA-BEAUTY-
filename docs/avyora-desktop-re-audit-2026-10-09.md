# Avyora desktop re-audit — 9 October 2026

**Verdict: stronger engineering foundation, but not ready to call the redesign or personalized recommendations complete. Request changes before release.**

The largest risks are safety checks that depend on product role rather than ingredients, personally linked questionnaire telemetry, and a hosted-photo lifecycle that does not enforce its customer-facing promises. The layout is closer to Nuvé, but empty photography slots dominate the page. Search and filtering entry points have been lost.

This audit covers workspace HEAD `7f5225d` plus the current uncommitted implementation. It does not establish what is deployed. Application source was not changed by this audit. Audit scripts, logs and screenshots are in `docs/audit-2026-10-09/`.

## Verification and limits

| Check | Fresh result |
| --- | --- |
| Type checking | Passed; no diagnostics |
| Lint | 0 errors, 20 warnings |
| Full suite, two workers | 76 files passed, 1 file skipped; 925 tests passed, 3 skipped |
| Production offline build, redesign and local scan flags enabled | Passed; shared first-load JS 103 kB, home 139 kB |
| Homepage and catalogue at 1280, 1440, 1920 pixels | No horizontal overflow in fresh browser checks |
| Homepage delivery wording | Incorrect threshold reproduced in browser |
| Catalogue canonical | Incorrect homepage canonical reproduced at all three widths |
| Face-photo page | Opens and honestly says analysis is unavailable |
| Launch readiness | Fails with 9 outstanding items |
| Safety, knowledge and budget edge cases | Reproduced using synthetic inputs against actual modules |
| Concurrent photo upload | Reproduced using migrated PGlite and in-memory storage |

The browser build intentionally had no database: its sold-out products and unavailable saving states are expected fixtures, not evidence that production stock is broken. No real purchase, provider email, production migration, real face upload or deployment was performed. Authenticated customer journeys, stock-backed checkout and Razorpay sandbox payment still need end-to-end browser verification in an isolated environment. This audit did not repeat the handoff's entire ten-page performance run. Empty image slots make current hero paint measurements unrepresentative of the finished visual design.

Evidence: [test log](<../docs/audit-2026-10-09/tests.log>), [build log](<../docs/audit-2026-10-09/build.log>), [launch gaps](<../docs/audit-2026-10-09/launch.log>), [synthetic reproductions](<../docs/audit-2026-10-09/reproductions.json>), [upload race reproduction](<../docs/audit-2026-10-09/scan-reproduction.json>), [desktop checks](<../docs/audit-2026-10-09/desktop-checks.json>).

P1 means fix before releasing the affected behavior. P2 means a material correctness, product or completion gap. Hosted-scan findings apply before that disabled feature is enabled.

## Findings

### A01 — P1 — Owned products bypass active and allergy eligibility

**Evidence:** [selection.ts](<../src/modules/personalization/core/selection.ts#L329>).

Owned essentials are selected by their user-assigned role, non-prescribed flag and absence of a known matching allergen. They bypass the catalogue's active classification, irritation and incomplete-formulation checks.

**Reproduced:** an irritated profile with an owned retinol-containing item labeled “moisturise” receives 14 scheduled uses, status complete and no problems. An owned cream with unknown ingredients is scheduled even when the user declares an ingredient allergy; equivalent catalogue products are excluded.

**Fix:** apply ingredient-based eligibility to owned items too. A role is not a safety classification. Unknown coverage must not prove absence of an allergen. Keep uncertain or unsuitable owned items outside the recommended schedule and explain why.

**Acceptance:** role relabeling cannot bypass irritation, pregnancy/nursing, prescription, allergy or frequency constraints.

### A02 — P1 — A conflicting partial plan remains actionable and saveable

**Evidence:** [planner.ts](<../src/modules/personalization/core/planner.ts#L250>), [routine POST](<../src/app/api/routines/route.ts#L87>).

Validation reports conflicts after placing essential slots but leaves them in the schedule. The saving endpoint rejects only no-match results, not nonempty hard-constraint problems.

**Reproduced:** two synthetic owned essentials containing a conflicting ingredient pair remain in every AM and PM session: 14 conflict reports, 28 owned-item placements, status partial.

**Fix:** distinguish “missing an essential” from “violates a safety constraint.” Remove conflicting placements or return a non-actionable invalid result. Recheck hard invariants inside the persistence boundary, not just in the endpoint.

**Acceptance:** zero hard violations in every displayed actionable and saved plan. Change the existing test that treats a conflict plus partial status as success.

### A03 — P1 — Full INCI validation checks counts, not ingredient identity

**Evidence:** [formulations.ts](<../src/modules/ingredients/formulations.ts#L113>).

A complete formulation can declare one ingredient in full INCI and a different ingredient in its structured rows, provided the counts match. Resolvable labels can also retain a null canonical ID.

**Reproduced:** full INCI “Niacinamide” with one structured “Aqua” row passes validation; the cleanser is selected for a profile allergic to niacinamide.

**Fix:** normalize and compare each full-INCI entry with its ordered structured row. Require resolved dictionary ingredients to carry their canonical IDs. Track unresolved ingredients explicitly; complete label coverage is not automatically complete allergen resolution.

**Acceptance:** mismatched names/order and missing known canonical IDs block publication; unknown resolution cannot silently clear an allergy check.

### A04 — P1 — Questionnaire information is saved as personally linked analytics without saving consent

**Evidence:** [routine page](<../src/app/routine-finder/page.tsx#L55>), [routine action](<../src/app/routine-finder/actions.ts#L20>), [activity writer](<../src/lib/activity.ts#L77>).

Completing the quiz sends skin type and the first concern to a server action. It stores them with the account ID or anonymous cookie. This is an individual event record, despite the comment calling it aggregate and non-personal. It has no routine-saving consent check or matching expiry field.

**Fix:** retain a completion count without skin answers or personal identifiers, or implement genuinely aggregated, approved telemetry separately. Do not treat routine-saving permission as analytics permission.

**Acceptance:** completing without saving produces no personally linked skin-type/concern record; deletion and retention cover any permitted personal telemetry.

### A05 — P1 — Error messages and stacks bypass the new redaction

**Evidence:** [observability.ts](<../src/lib/observability.ts#L134>).

Only extra fields are redacted. The normalized error message/stack goes directly to stdout, and the original Error is sent to Sentry.

**Reproduced:** an Error containing a synthetic email and newsletter token logs both unchanged.

**Fix:** sanitize the complete error envelope, free-text informational messages and monitoring payloads. Add provider-level scrubbing before external error reporting; review direct console logging in the new personal-data paths.

**Acceptance:** captured stdout and monitoring payloads contain no synthetic email, token, private-object path or questionnaire data, including inside error messages and stacks.

### A06 — P1 — A daily sweep cannot guarantee photo deletion within 24 hours

**Evidence:** [daily scheduler](<../vercel.json#L8>), [scan sweep](<../src/modules/scans/sessions.ts#L143>), [scan UI](<../src/app/scan/scan-flow.tsx#L275>).

The database expiry is not a storage deletion. Photos are removed only when an applicable sweep or terminal processing path runs. With no analyzer, uploads remain uploaded. A photo expiring just after a daily sweep can remain for nearly another day.

**Fix:** enforce object retention independently of request traffic through a suitable deletion scheduler/lifecycle mechanism, monitor lateness, and word the promise to match actual guarantees. An inaccessible object still exists in storage.

**Acceptance:** simulated uploads at all scheduler boundaries meet the stated retention deadline; failed deletes remain retryable and visible.

### A07 — P1 — Delete-photo UI loses the session even when deletion fails

**Evidence:** [scan-flow.tsx](<../src/app/scan/scan-flow.tsx#L142>).

The delete handler ignores HTTP failures and catches network failures, then clears the scan ID and returns to the intro. The customer loses their retry control while the photo may remain.

**Fix:** check the deletion response, retain the ID on failure, expose a retry and distinguish requested deletion from confirmed completion. Ensure privacy actions remain available when admission/analysis flags are switched off.

**Acceptance:** 429, 503, failed storage and disconnected-network cases never appear completed and retain a usable retry.

### A08 — P1 — Approved usage constraints apply only to catalogue treatments

**Evidence:** [planner.ts](<../src/modules/personalization/core/planner.ts#L131>), [essential placement](<../src/modules/personalization/core/planner.ts#L193>).

Essentials are placed according to hardcoded role sessions; optional items go into every evening. Timing/frequency checks count only products in the treatment map.

**Reproduced:** a synthetic cleanser usage profile allowing PM only and a maximum of two weekly uses is scheduled 14 times, with no validation problems.

**Fix:** enforce the usage profile for every scheduled product, including essentials, optional products and suitably classified owned products. Separate basic role defaults from verified product-specific directions. Missing information must not become an invented frequency.

**Acceptance:** a restrictive usage profile cannot be overridden by changing role or optional status.

### A09 — P2 — Experience/adherence answers are disconnected from the new engine

**Evidence:** [profile-to-rule mapping](<../src/modules/personalization/core/routine.ts#L70>), [beginner rule](<../src/data/knowledge.ts#L53>).

The quiz collects experience and adherence, but neither reaches selection/planning. Rules expect experienceLevel values such as N0/N1; ruleProfile never supplies them.

**Reproduced with fixture knowledge:** the beginner restriction does not apply, a treatment is selected, and changing experience/adherence plus skin type yields the same schedule.

**Fix:** define and test a versioned adapter between V2 answers and rule fields. Make experience/adherence affect approved introduction and complexity policies. Audit every question for an actual decision or clearly stated informational purpose.

**Acceptance:** the approved beginner rule matches a new user; unrelated changes do not manufacture a clinical rule.

### A10 — P2 — The Bayesian package has no quiz evidence adapter

**Evidence:** [routine.ts](<../src/modules/personalization/core/routine.ts#L102>).

Inference receives only externally supplied observations. The quiz supplies priorities, not categorical evidence. With future validated parameters, quiz-only beliefs therefore stay at priors rather than update from answers. The current parameter registry is empty, so no calibrated production inference exists today.

**Fix:** create an explicit answer-to-evidence adapter with validated group/state semantics, canonical concern IDs, source scope and correlation controls. Test through computeRoutine, not just inferConcerns.

**Acceptance:** approved quiz evidence changes the intended posterior, missing evidence is neutral, and duplicate quiz/photo evidence contributes once.

### A11 — P2 — Invalid categorical Bayesian distributions can be published

**Evidence:** [parameter validation](<../src/modules/knowledge/compile.ts#L123>).

Each likelihood is checked individually, but categorical sums are not validated.

**Reproduced:** two mutually exclusive states in one group with concern likelihoods 0.6 and 0.8 compile successfully.

**Fix:** specify whether a group is exhaustive categorical or a single binary event. For categorical groups, validate states and distributions for both concern conditions, including explicit unknown handling. Require appropriate calibration provenance.

**Acceptance:** impossible sums, duplicate states and incomplete required distributions fail compilation and runtime parameter reading.

### A12 — P2 — Greedy purchasing can miss an affordable complete essentials set

**Evidence:** [selection.ts](<../src/modules/personalization/core/selection.ts#L341>).

The selector buys the highest-ranked affordable moisturiser before reserving money for the remaining essentials.

**Reproduced with synthetic prices:** budget ₹300; a complete ₹100 + ₹100 + ₹100 core exists. Ranking chooses a ₹150 moisturiser, then ₹100 sunscreen, and leaves cleanser unfilled.

**Fix:** optimize feasibility across the three essential roles first, then ranking. A small bounded search is sufficient for this catalogue. Optional purchases follow a feasible core.

**Acceptance:** when a valid complete core exists within budget, selection does not return partial solely because of purchase order.

### A13 — P2 — Concurrent uploads delete the successful request's photo

**Evidence:** [sessions.ts](<../src/modules/scans/sessions.ts#L63>).

Two requests can read created, write the same object key, then race the status update. The losing request deletes the shared key.

**Reproduced:** one upload returns success, the other wrong-state, database status remains uploaded, storedPhotoExists is false.

**Fix:** acquire an upload lease/state atomically before writing, or use request-specific staged keys and atomically adopt one. A losing request may delete only its own object. Include crash/orphan cleanup.

**Acceptance:** concurrent upload/retry tests preserve the winner's bytes and leave no untracked private objects.

### A14 — P2 — Scan network and camera lifecycle failures are incomplete

**Evidence:** [scan-flow.tsx](<../src/app/scan/scan-flow.tsx#L96>).

send has no enclosing failure handler for rejected fetches, so it can remain sending indefinitely. Start camera remains callable repeatedly without stopping the previous stream. Uploading a file while the camera is active does not stop it when the preview leaves the screen. Asynchronous operations are not canceled or generation-guarded on exit/retake.

**Fix:** add catch/finally recovery, bounded requests and an operation generation/abort controller. Stop existing camera tracks before replacement and whenever capture is left. Prevent retake from racing an upload.

**Acceptance:** denied permission, repeated start, file selection during capture, network loss and exit during processing all release resources and recover predictably.

### A15 — P2 — Hosted upload accepts files larger than the platform can receive

**Evidence:** [image cap](<../src/modules/scans/image-validation.ts#L10>), [body cap](<../src/lib/request-body.ts#L27>).

The browser accepts 5 MiB and uploads raw bytes through a Next route. Vercel Functions cap request payloads at 4.5 MB; accepted files can be rejected before the route produces its intended error. [Official Vercel limits](https://vercel.com/docs/functions/limitations).

**Fix:** use a conservative cap below the deployment limit for proxied uploads, or implement a private, bounded direct-upload authorization path with mandatory server-side validation before processing.

**Acceptance:** the UI limit and deployment limit agree; boundary tests include actual transport overhead and platform behavior.

### A16 — P2 — The Nuvé visual replica is incomplete

**Evidence:** [hero image slot](<../src/components/nv/home/hero.tsx#L33>), [landing image slots](<../src/components/nv/home/landing.tsx#L32>).

The hero and seven campaign/editorial slots have null sources. The hero is a gradient. Matching section heights does not establish visual fidelity when the defining photography is absent. Catalogue photography showing other brands remains elsewhere.

**Fix:** supply approved campaign/product assets, implement measured crops and compare the complete rendered page. Test long review text inside fixed-size testimonial cards too.

**Acceptance:** every intended photo slot has an approved asset; comparisons include images, text, interactions and motion. Mark this work partial until then.

![Current 1440-pixel hero](<../docs/audit-2026-10-09/1440-home.png>)

### A17 — P2 — Homepage shipping threshold is truncated to ₹1

**Evidence:** [landing.tsx](<../src/components/nv/home/landing.tsx#L353>).

DELIVERY_TERMS.split(',')[0] cuts the thousands separator in ₹1,199. The pricing section says “Delivery is ₹79 on orders below ₹1,” while the FAQ/footer show the actual threshold.

**Fix:** render the full sentence or format a short label from structured money constants. Never parse a monetary policy by punctuation.

**Acceptance:** homepage, FAQ, bag, checkout and invoice wording derive from the same values.

### A18 — P2 — The redesign removed search and category/concern discovery

**Evidence:** [new header](<../src/components/nv/shell/site-header.tsx#L32>), [new navigation](<../src/components/nv/shell/nav.ts#L6>), [collection controls](<../src/app/collections/collections-client.tsx#L141>).

The old header exposed search and category/concern entry points. The replacement exposes neither; collections offers sorting only. URL filters still work but customers have no corresponding controls.

**Fix:** restore search and usable category/concern filters within the new design. Preserve query state, clear filters and keyboard access.

**Acceptance:** users can search and narrow products without editing URLs. This is a direct failure of the requirement to preserve old features.

### A19 — P2 — Catalogue reviews and “Top rated” sorting ignore the new review system

**Evidence:** [rating sort](<../src/app/collections/collections-client.tsx#L98>), [card review fields](<../src/components/product/product-card.tsx#L154>), [published reviews](<../src/modules/reviews/reviews.ts#L74>).

Product details load real review aggregates; collection cards and sorting still read optional rating fields on the static catalogue, where those fields have been removed.

**Fix:** batch published review aggregates into catalogue display data and sort/display from that shared source. Hide rating sort until meaningful data exists.

**Acceptance:** publishing a review updates the product page, listing count/rating and rating order within the defined cache window.

### A20 — P2 — Collection pages inherit the homepage canonical

**Evidence:** [root metadata](<../src/app/layout.tsx#L85>), [collection metadata](<../src/app/collections/page.tsx#L5>).

Fresh browser inspection of /collections returns the homepage origin as canonical. Collection metadata does not override the root '/'. Other routes without overrides need review too.

**Fix:** set canonicals per public page and specify the indexing policy for search/filter variants. Mark private and token routes appropriately.

**Acceptance:** /collections canonicals to /collections; product and journal detail routes canonical to their own stable URLs.

### A21 — P2 — Newsletter claims email delivery after a provider failure

**Evidence:** [newsletter route](<../src/app/api/newsletter/route.ts#L40>), [email result](<../src/lib/notify.ts#L50>).

sendEmail returns an explicit failure result, but signup ignores it and always reports that a confirmation email is on its way.

**Fix:** check delivery outcomes without revealing subscription status. Prefer a transactional outbox/retry for confirmation delivery, or return a uniform temporary failure with a safe retry path. Ensure token rotation cannot race delivery.

**Acceptance:** timeout/rejection never produces an unqualified delivered/on-the-way claim, and retry works without downgrading confirmed subscribers.

### A22 — P2 — Saved routines keep historical purchase quotes without refreshing stock

**Evidence:** [saved loading](<../src/app/routine-finder/routine-session.ts#L188>), [staleness check](<../src/app/routine-finder/results-view.tsx#L76>), [add-to-bag](<../src/app/routine-finder/results-view.tsx#L314>).

Saved loading restores old prices but fetches no current quote. Saved status suppresses the stale-price warning; stock caps are undefined. Customers can add from an old purchase list without seeing current availability. Checkout remains authoritative, so this is a display/selection gap rather than proof of an incorrect charge.

**Fix:** preserve the historical schedule separately, but fetch a fresh purchase quote on reopening and before bag actions. Explain replacements and budget changes; do not silently rewrite the saved schedule.

**Acceptance:** a saved routine reopened after a price/stock change shows current purchase information and blocks unavailable SKUs.

## What genuinely improved

- SKU-aware cart quantities/pricing, guarded storage and account synchronization have substantially better code and test coverage.
- Unknown safety answers remain explicit. Catalogue treatments are conservative when approved formulation/direction data is absent.
- A shared pure selection/planning engine runs in the browser and is recomputed server-side for saving.
- Knowledge releases are versioned, checksummed and separate from personal data; draft records do not become invented approvals.
- Durable rate quotas, owned routine retrieval, private response caching and moderated purchase-linked reviews are implemented.
- No runtime LLM is required for recommendations or the assistant.
- The scan page honestly says no model is available. That honesty should remain.

Do not translate these improvements into blanket “all audit findings resolved.” The owned-product path, telemetry and publication checks above disprove that claim.

## Completion gaps, not fabricated defects

The repository currently has no validated Bayesian parameters or approved education answers. Treatment directions remain pending for eight products. Production scan storage has no adapter beyond local development storage; configuredSkinAnalyzer returns null. Scan-result polling and passing a scan into the browser routine flow are still pending. Interactive scan processing cadence and global inference concurrency must be verified before enabling inference; the generic daily worker is not an interactive scan service.

Support/policy pages still contain unconfirmed placeholders and the support mailbox is unverified. Coupons and loyalty remain unimplemented pending written rules. Mobile remains outside this audit.

The handoff should classify these as pending/disabled dependencies rather than completed capabilities.

## Recommended repair order

1. **Safety/data integrity:** A01–A03 and A08. Introduce one shared slot-eligibility validator for owned and catalogue products. Separate acceptable partial coverage from invalid constraints; refuse invalid plans at rendering and persistence.
2. **Privacy:** A04–A07. Remove linked skin telemetry, scrub entire error payloads, implement truthful deletion/retention states and preserve failed-action retries.
3. **Recommendation quality:** A09–A12 and A22. Wire answered variables into the versioned rules, implement quiz evidence only with validated parameters, enforce categorical validity, solve essentials feasibility and refresh purchase quotes.
4. **Hosted scan readiness:** A13–A15. Fix atomic upload ownership, camera/request lifecycle and transport limits; keep inference disabled until model, storage and worker requirements are met.
5. **Desktop product completion:** A16–A21. Finish approved photography, restore discovery, connect real reviews, fix shipping/canonical metadata and make newsletter delivery reliable.
6. **Release acceptance:** run a database-backed browser matrix for guest/account merge, routine reload/deletion, review moderation, support, newsletter and sandbox checkout. Test failures and retries, not only the happy path.

Keep the current modular monolith. Another rewrite, vector database or per-request LLM will not solve these defects. For competing as a skincare business, verified formulation/direction data, trustworthy product assets, usable discovery and dependable checkout are the immediate prerequisites. Add evaluated scan evidence only after the quiz-only system is reliable.

## Reproducing the audit cases

The audit scripts use synthetic labels/directions and disposable PGlite/in-memory storage. They do not encode clinical recommendations.

- `node node_modules/tsx/dist/cli.mjs docs/audit-2026-10-09/reproduce.mts`
- `node node_modules/tsx/dist/cli.mjs docs/audit-2026-10-09/reproduce-scan.mts`

Run with DATABASE_URL and DATABASE_REPLICA_URL empty. Application files were preserved; no fixes, migrations, commits or deployments were made.

