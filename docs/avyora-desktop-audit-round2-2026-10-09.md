# Avyora desktop audit — second verification pass

9 October 2026. Reviewed the current working tree at HEAD `7f5225d`, including the extensive uncommitted implementation changes.

## Verdict

**Substantial improvement, but request changes before calling the platform complete.** The original synthetic regressions now pass. Additional edge cases reveal **11 actionable findings: four P1 and seven P2**. Some concern future product records or a future enabled analyzer; they are not evidence of an unsafe live product recommendation today.

Products will be added later. Missing products, photography, formulations, stock, genuine reviews and clinical evidence are expected dependencies and are **not counted as defects** in this audit. Desktop remains the scope. The selected Nuvé design direction remains unchanged.

No application fixes, commits, production migrations, purchases, real email sends or deployments were performed. Audit evidence uses synthetic records, disposable PGlite and in-memory storage. Browser checks used a fresh offline production build on localhost with database access and hosted upload disabled. Production was not inspected.

## Verification evidence

| Check | Result |
| --- | --- |
| Full suite | **79 files passed, 1 skipped; 987 tests passed, 3 skipped**; two workers; 263.48 seconds |
| Typecheck | Passed |
| Lint | **0 errors, 26 warnings** |
| Offline production build | Passed; 51 static pages generated |
| Original synthetic audit cases | Unknown-allergy owned product excluded; irritated owned retinol scheduled zero times; previous conflicting owned actives excluded; essential usage limited to two uses; beginner/adherence rules applied; invalid Bayesian distribution rejected; original message/token scrubbed; mismatched INCI rejected; original ₹300 affordable core completed |
| Concurrent scan uploads | One winner, one wrong-state response; winner's object preserved; one tracked object remains |
| Desktop browser | Home and shop checked at 1280, 1440 and 1920; no horizontal overflow; collection canonical correct at all three widths |
| Browser interactions | Ingredient search, clear filters, two-product comparison and all 14 quiz steps exercised; no-stock result rendered; scan unavailable message inspected |

The first test attempt explicitly disabled database configuration, which made inventory tests short-circuit rather than exercise their injected database. That run was stopped. The reported full run used an unreachable localhost dummy URL to satisfy that configuration guard; integration suites used their own disposable databases. It never used the user's database.

Logs and repro outputs are in [audit evidence](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2>). Passing tests do not cover all the additional cases below.

## Findings

### R01 — P1 — Ingredient-based eligibility still does not enforce every active policy

Evidence: [role-specific policy block](</C:/Users/champ/Desktop/avyora-beauty/src/modules/personalization/core/selection.ts:204>), [shared ingredient checks](</C:/Users/champ/Desktop/avyora-beauty/src/modules/personalization/core/eligibility.ts:97>).

The new shared validator handles irritation, age, pregnancy and missing usage information. However, the customer's prescription-use restriction and approved `excludedClasses` still run only when the role is `treatment`. The treatment-count limit likewise governs only treatment slots.

**Reproduced:** a synthetic retinol product assigned `moisturise`, with usage directions, is selected and scheduled twice even with `prescribedTreatment=yes`, an excluded retinoid class and `maxTreatments=0`. The plan reports no problems. This tests enforcement of the application's policies, not a clinical judgment about a particular formulation.

**Fix:** apply the relevant approved restrictions to identified ingredient classes for every role. Define how active-containing essentials contribute to combination and introduction limits. A role must determine placement without weakening eligibility.

**Acceptance:** changing a synthetic product's role cannot bypass prescription-use or approved ingredient exclusions.

### R02 — P1 — Known ingredients in partial formulations disappear from checks

Evidence: [catalogueEvidence](</C:/Users/champ/Desktop/avyora-beauty/src/modules/personalization/core/eligibility.ts:59>), [possibleIngredients](</C:/Users/champ/Desktop/avyora-beauty/src/modules/personalization/core/selection.ts:140>).

For partial formulations, both paths fall back to product highlights instead of preserving the ingredients already recorded. Incomplete coverage should prevent claims about absence; it should not erase known presence.

**Reproduced:** a partial formulation records retinol, while the product highlights mention only glycerin. The moisturizer passes selection for a currently irritated profile with no exclusions.

**Fix:** preserve all resolved and possible identities from partial formulation rows; conservatively merge highlights where appropriate. Keep coverage partial. Use this same evidence in eligibility, interactions and planning.

**Acceptance:** a known active or interaction ingredient cannot disappear when coverage changes from complete to partial or marketing highlights change.

### R03 — P1 — Onboarding can declare invalid usage directions ready

Evidence: [directions schema](</C:/Users/champ/Desktop/avyora-beauty/src/modules/catalog/onboarding.ts:68>), [limited validation](</C:/Users/champ/Desktop/avyora-beauty/src/modules/catalog/onboarding.ts:137>), [recommendable flag](</C:/Users/champ/Desktop/avyora-beauty/src/modules/catalog/onboarding.ts:152>).

The schema accepts any non-null object as directions. The preview checks version and referenced evidence but not the actual usage schema or approval fields.

**Reproduced:** a treatment record with session `not-a-session`, maximum 999 weekly uses, introduction -5, empty reviewer/text and an invalid date returns `ok=true`, `publishable=true`, `recommendable=true`.

The preview is read-only; this is a false readiness signal, not proof that invalid directions have been published. Later knowledge checks reject some frequency errors, but the onboarding gate still contradicts its purpose and does not validate every field.

**Fix:** use a shared strict runtime schema for directions, enforce bounds and review requirements, and align preview, release compilation and runtime reading. Do not equate object presence with approval.

**Acceptance:** the reproduced invalid record is blocked with field errors; valid records receive consistent decisions across the gates.

### R04 — P2 — Malformed formulation JSON crashes the onboarding preview

Evidence: [formulation schema](</C:/Users/champ/Desktop/avyora-beauty/src/modules/catalog/onboarding.ts:67>), [unsafe validator invocation](</C:/Users/champ/Desktop/avyora-beauty/src/modules/catalog/onboarding.ts:132>).

**Reproduced:** an otherwise valid record containing `formulation: {}` passes the object check and throws `Cannot read properties of undefined (reading 'map')`. The staff action has no enclosing recovery for this failure.

**Fix:** validate nested formulation rows and required fields before invoking typed helpers. Return bounded per-field errors for malformed arrays, concentrations, dates and coverage values.

**Acceptance:** malformed staff input and CLI input produce useful validation reports without an unhandled exception.

### R05 — P2 — Top-ten pruning loses feasible budget combinations

Evidence: [candidate truncation](</C:/Users/champ/Desktop/avyora-beauty/src/modules/personalization/core/selection.ts:353>).

The original greedy issue is repaired, but the search includes only the ten highest-ranked candidates per role. A cheap candidate can rank below that cutoff and be the only way to complete the core.

**Reproduced:** ten ₹150 moisturizers rank above a ₹100 moisturizer; cleanser and sunscreen each cost ₹100. A ₹300 complete core exists, but selection chooses a ₹250 two-item plan and says no combination fits the cleanser step.

**Fix:** preserve feasibility before pruning: retain a price/score Pareto frontier or always include budget-essential low-cost candidates. Bound the computation without making a false infeasibility claim.

**Acceptance:** a valid complete core remains discoverable when a role has more than ten candidates.

### R06 — P2 — Recalculating a saved routine retains its old display quote

Evidence: [compute state updates](</C:/Users/champ/Desktop/avyora-beauty/src/app/routine-finder/routine-session.ts:128>), [display quote precedence](</C:/Users/champ/Desktop/avyora-beauty/src/app/routine-finder/results-view.tsx:64>).

`compute()` clears the saved view but leaves `state.quote` intact. Results rendering continues to prefer those old quote lines over the newly computed purchase list. Old availability flags can also survive.

**Reproduced:** reopen a saved routine with a ₹100 quote, change prices and budget, then recompute. The new purchase list uses ₹150 while `state.quote` still uses ₹100 and the controller reports ready.

**Fix:** clear historical quote state when entering a new computation and atomically install the new result's purchase display data. Guard asynchronous refreshes against overwriting newer state.

**Acceptance:** budget edits, substitutions and recalculation after reopening show only the new plan's quote and availability.

### R07 — P2 — Bag actions remain enabled without a successful current quote

Evidence: [staleness calculation](</C:/Users/champ/Desktop/avyora-beauty/src/app/routine-finder/results-view.tsx:80>), [individual add](</C:/Users/champ/Desktop/avyora-beauty/src/app/routine-finder/results-view.tsx:330>), [batch add](</C:/Users/champ/Desktop/avyora-beauty/src/app/routine-finder/results-view.tsx:389>).

Reopening fetches a quote, but loading/failure does not block purchase actions. Expiry merely shows a notice. The individual add ignores the supplied busy/saving `disabled` flag; neither add handler refreshes before acting.

**Reproduced controller state:** when the saved-quote request fails, phase remains ready, `quote=null`, `pricesExpireAt=null`, stock is empty and the historical purchase list remains. Rendering falls back to historical prices, treats unavailable as false and supplies no stock cap. Source inspection confirms the controls can add those items.

**Fix:** use an explicit quote state: loading/current/expired/failed. Disable purchase actions until current availability is known; refresh and handle changed prices/stock before adding. Apply busy/saving guards to both individual and batch buttons.

**Acceptance:** slow, failed and expired quotes never enable bag actions with historical purchase information. Checkout remains authoritative; this finding does not establish an incorrect charge.

### R08 — P1 — Scan polling still equates terminal status with deleted photo

Evidence: [poll terminal handling](</C:/Users/champ/Desktop/avyora-beauty/src/app/scan/scan-flow.tsx:176>), [status response](</C:/Users/champ/Desktop/avyora-beauty/src/modules/scans/sessions.ts:103>), [completion after failed deletion](</C:/Users/champ/Desktop/avyora-beauty/src/modules/ai/skin-analysis.ts:172>).

Direct deletion now reports pending correctly. Polling does not: completed, failed, revoked and even 404 all produce `photo='deleted'`, which removes the delete button. Backend terminal states can still retain an object after storage failure. A 404 is not confirmation of deletion either.

**Reproduced backend state:** failed storage deletion returns false, session status is failed, and the photo remains. `getScan()` exposes no photo deletion state. This is a latent polling defect until an analyzer/queued workflow is enabled; the current no-model upload response has a correct separate deletion result.

**Fix:** expose an owner-safe deletion status without object keys, and render that status independently from analysis status. Preserve deletion recovery when a status result is unavailable.

**Acceptance:** failed object deletion after successful or failed analysis never displays “Your photo has been deleted” or removes the retry.

### R09 — P2 — Stop waiting leaves the scan on the processing screen

Evidence: [poll abort exit](</C:/Users/champ/Desktop/avyora-beauty/src/app/scan/scan-flow.tsx:169>), [Stop waiting handler](</C:/Users/champ/Desktop/avyora-beauty/src/app/scan/scan-flow.tsx:382>).

The button aborts the controller but does not change the step. The poll returns on abort without installing an outcome. The processing panel remains indefinitely, with no questionnaire link or photo-deletion control in that panel.

**Fix:** keep the scan ID independently and transition to a recoverable stopped-waiting state. Offer questionnaire continuation, status refresh and explicit deletion. Do not imply that stopping the wait canceled server work.

**Acceptance:** stopping during a queued scan immediately exposes these recovery actions. Code-path finding; a real analyzer browser run was not performed.

### R10 — P2 — Deep log context still bypasses redaction

Evidence: [depth cutoff](</C:/Users/champ/Desktop/avyora-beauty/src/lib/observability.ts:133>), [stdout context](</C:/Users/champ/Desktop/avyora-beauty/src/lib/observability.ts:177>).

The original message/stack leak is repaired. However, `redact()` returns deep objects unchanged instead of safely truncating them. It is still the function used for stdout extra context.

**Reproduced:** a synthetic nested context logs both `nested-person@example.test` and `SYNTHETIC_NESTED_TOKEN` unchanged. External monitoring's additional deep scrub does not protect stdout.

**Fix:** replace over-depth branches with a safe marker, or perform a bounded traversal that never returns uninspected strings/objects. Cover arrays and nested error/provider payloads. Review free-text token formats too.

**Acceptance:** secrets and personal data never survive because the context was nested beyond the traversal limit.

### R11 — P2 — Header search does not synchronize the shop search field

Evidence: [one-time draft initialization](</C:/Users/champ/Desktop/avyora-beauty/src/app/collections/collections-client.tsx:59>).

**Browser reproduced:** from `/collections`, open header search and search retinol. URL and heading become `?q=retinol` / Results for retinol, but the shop search field is blank. It initializes only on mount. Submitting that blank form unexpectedly clears the active query.

**Fix:** synchronize the draft when the committed URL query changes, without resetting ordinary typing. Deliberately choose push/replace history semantics for committed searches and filter changes; current `router.replace` does not create a history entry for each change.

**Acceptance:** header navigation, direct links, query removal and browser history show matching committed query/results and an editable search field.

![Search results show retinol while the search field is empty](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/search-state.png>)

## Status of the previous 22 findings

“Verified repaired” is limited to the evidence collected here; it is not a production certification.

| Earlier ID | Current assessment |
| --- | --- |
| A01 owned-product bypass | Original retinol/allergy cases repaired; active policy coverage still incomplete elsewhere: R01–R02 |
| A02 actionable hard-conflict plans | Invalid status, server refusal and UI blocking implemented; original owned conflict case now removes the actives |
| A03 INCI identity mismatch | Original mismatch and missing canonical identity rejected |
| A04 linked skin telemetry | Quiz completion action now stores no answers/account/cookie identity |
| A05 error redaction | Original error message/token repaired; deep stdout context still leaks: R10 |
| A06 photo retention | No-model photos are discarded immediately; failed deletes remain retryable. Frequent retention endpoint exists but is not scheduled in vercel.json; operational cadence/lifecycle remains a dependency |
| A07 failed delete UI | Direct DELETE response checked; retries preserved; admission flag no longer gates privacy access. Polling still lies: R08 |
| A08 usage constraints | Original essential timing/frequency fixture passes; remaining ingredient-role policy gap is R01 |
| A09 experience/adherence | Adapter and fixture rules connected; real approved knowledge remains a dependency |
| A10 quiz Bayesian mapping | Explicit adapter and correlation aliases added; regression cases pass; no invented production parameters |
| A11 categorical distribution | Original invalid group rejected; group semantics checked |
| A12 budget greediness | Original case repaired; expanded candidate pool still loses feasibility: R05 |
| A13 upload race | Reproduced two-request race now preserves winner and removes losing object's bytes |
| A14 camera/network recovery | Cleanup, bounded requests and cancellation added; stop-waiting recovery still incomplete: R09. Real camera permission workflow not exercised |
| A15 transport cap | Shared cap reduced to 4 MiB; production transport boundary was not exercised |
| A16 imagery | Deferred asset dependency per owner; not counted as a defect |
| A17 truncated shipping text | Structured short policy used; full threshold visible in browser; no comma split remains |
| A18 discovery removed | Search, category/concern filters and comparison restored; R11 query synchronization remains |
| A19 review aggregates | Listing now receives real aggregates; rating option hidden without data. Live publication/cache propagation not browser-tested |
| A20 canonical | Collection canonical browser-verified at all three widths; public route overrides added |
| A21 newsletter failure | Retried confirmation job and conditional response implemented; synthetic suite passes; live provider delivery not tested |
| A22 saved quotes | Refresh added, but R06–R07 still leave display and action gaps |

## Desktop assessment and remaining dependencies

The site now has more complete navigation and comparison. The sample notice and unavailable scan message are honest. These improvements are supported by browser evidence, not just code comments.

The homepage still uses reserved photography surfaces, which is expected until approved assets arrive. Review visual fidelity once images, crops and final copy exist. Product absence is not a reason to rewrite the architecture.

Additional polish: quiz introduction says fifteen questions but this path contains fourteen; `/scan` nests a main landmark inside the shell's main; comparison checkboxes all use the name “Compare” rather than a product-specific name. These deserve correction, but they are not included in the 11 principal findings.

Product onboarding is a read-only validator followed by manual source changes, not a complete publishing pipeline. The referenced `docs/product-onboarding.md` was not present in this snapshot. Existing role/treatment maps, derived SKU IDs, evidence registries and verified Product records need an explicit mapping/import procedure before adding a new range. Do not assume copying a READY JSON record automatically populates the storefront, knowledge release, inventory and planner.

Still unverified: production deployment, database-backed browser sign-in/merge, actual saved-routine browser persistence, sandbox payment provider, live review propagation, email delivery, real camera capture and evaluated vision output. Database integration tests and synthetic repros provide useful evidence but do not replace these end-to-end checks. No full accessibility certification or real-user speed measurement was performed.

## Repair order

1. Complete ingredient-based policy enforcement and partial evidence handling: R01–R02.
2. Share strict onboarding schemas and usage approval validation: R03–R04.
3. Repair quote lifecycle and purchase-action gating: R06–R07.
4. Make scan privacy state independent from analysis status and finish cancellation recovery: R08–R09. Keep production inference disabled meanwhile.
5. Fix bounded redaction, candidate feasibility and search synchronization: R10, R05, R11.
6. Add these exact regression cases, finish the onboarding mapping instructions and run the database-backed desktop acceptance matrix before claiming completion.

## Reproduction artifacts

- [Core and onboarding cases](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/reproductions.json>)
- [Saved routine quote cases](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/session-reproduction.json>)
- [Scan race and failed deletion](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/scan-reproduction.log>)
- [Previous cases rerun](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/previous-reproductions.json>)
- [Desktop width checks](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/desktop-checks.json>)
- [Test log](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/tests.log>), [lint log](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/lint.log>), [typecheck log](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/typecheck.log>), [build log](</C:/Users/champ/Desktop/avyora-beauty/docs/audit-2026-10-09-round2/build.log>)

The three `.mts` scripts in the evidence directory use synthetic inputs. Set DATABASE_URL, DATABASE_REPLICA_URL and monitoring DSNs empty when running them. The scan script creates only disposable PGlite and in-memory image storage.
