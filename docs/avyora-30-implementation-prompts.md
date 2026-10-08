# Avyora 30 Implementation Prompts

Run these prompts in order. Each prompt is a separate implementation task, not a request to implement the entire project again. The current scope is the desktop website. Mobile UI design and setup start only after the owner finishes desktop testing and explicitly requests that phase.

## Shared instructions for every prompt

Work in C:/Users/champ/Desktop/avyora-beauty. Read the applicable AGENTS.md instructions, the current implementation progress record, and the relevant sections of C:/Users/champ/Desktop/avyora-beauty/docs/avyora-developer-implementation-specification-2026-10-07.md. Use C:/Users/champ/Desktop/avyora-beauty/docs/avyora-product-architecture-audit-2026-10-07.md as the defect evidence register. Inspect current code before acting because earlier prompts may already have changed it.

The primary visual reference is the current live https://nuve-beauty.framer.website/, selected by the owner. https://lovi.care/ and the linked Lovi Figma Community listing are secondary inspiration. The earlier lavender video is not the design target. Preserve Avyora's existing customer, commerce, CMS, owner and manager features. Keep Next.js, TypeScript, Drizzle, PostgreSQL and the existing transaction, payment and job foundations. Apply deterministic constraints and Bayesian inference to recommendations; do not add an LLM call to routine generation.

Preserve user changes. Keep implementation focused on this prompt and its prerequisites. Use additive, compatible migrations and staging or local fixtures for verification. Keep secrets and personal data out of reports. Run the relevant checks, fix failures caused by the changes and update docs/implementation-progress.md with completed work, evidence and genuinely unresolved dependencies. Do not label invented formulation data, synthetic photos, guessed business details or an unevaluated model as production-ready. Deliver a concise account of the change, verification and remaining limitations. Do not deploy production or perform real purchases as part of these prompts.

## Prompt 1 Build baseline and implementation tracking

Prepare Avyora for the desktop implementation without redesigning the UI yet. Read the full developer specification and audit, inspect repository instructions and record the current Git state while preserving existing changes. Fix the Windows-incompatible build script so Next.js builds through a portable command. Run typecheck, lint, tests and a production build; investigate reproducible failures instead of blindly increasing timeouts or disabling checks. Verify the build-time journal/content dependency and document any unavailable local database without silently publishing empty content. Create docs/implementation-progress.md with the existing route and feature inventory, baseline results and the remaining 30-prompt sequence. Pass when the portable build path and baseline status are clear and no commerce or staff feature has been removed.

## Prompt 2 Cart variant quantity and price correctness

Fix the reproduced cart defects before changing its design. Trace selected product variant and quantity from the product page through the store provider, bag and server checkout. Use a stable SKU/variant identity and integer quantities rather than a cached base product price. Make Add to Cart honor the selected quantity. Resolve displayed prices through the shared variant and pricing service, including sale prices and admin overrides. Validate versioned local cart storage and provide an in-memory fallback if storage is malformed or unavailable. Recheck stock and current prices before order placement while preserving existing reservations, idempotency and payment logic. Add meaningful regression coverage: a 90ml variant selected at quantity 3 must remain that variant with quantity 3, and its displayed amount must equal the current unit price times 3. Also cover default variants, price changes and stock limits. Do not hardcode historical live prices.

## Prompt 3 Immediate routine safety and simplicity fixes

Correct the current routine engine's contradictions before implementing the new Bayesian model. Preserve pregnancy answers as yes, no and unknown through the quiz, normalization and storage; Prefer not to say must remain unknown. Apply the approved irritation and reactivity restrictions to the complete plan, not only retinoids. Remove elective irritating treatments from an essentials/recovery result rather than leaving vitamin C or exfoliation beside a barrier-repair explanation. Give beginners a small essential routine with a maximum of three steps per AM or PM session; toner, essence, eye products and exfoliation must be explicit optional additions. Do not introduce a treatment with unresolved formulation or approved-use information. Replace unsafe generic twice-daily active-product directions with approved product-specific copy where available; otherwise mark missing directions and prevent that treatment from being published or recommended. Add tests for irritated skin, very high reactivity, unknown pregnancy, under18 and beginner step caps. Keep safety assumptions explicit and do not invent medical rules or efficacy claims.

## Prompt 4 Honest claims offers and business content

Remove or gate claims that the application cannot fulfill. Audit promotional banners, bundle descriptions, cashback, loyalty, free delivery and gifts against real order calculations. Until their implementation arrives in Prompt 29, publish only offers the backend actually applies. Make shipping copy agree with the shared shipping rules. Remove unsubstantiated absolute product claims and fabricated social proof. Inventory policy placeholders and dummy support details; fill only verified business information, otherwise document the missing fields and prevent unfinished public content from being treated as launch-ready. Add publication validation and a focused consistency check. Preserve operational capabilities while correcting misleading public copy.

## Prompt 5 Normalized catalogue and SKU migration

Introduce the catalogue product and variant records specified in the document. Map every existing catalogue item, size, inventory key and price override to a stable product and SKU identity. Use additive Drizzle migrations, unique SKU/slug constraints and an explicit compatibility map. Preserve historical order names, sizes and charged values. Seed the current catalogue without fabricating missing formulation fields. Validate mapping coverage, duplicate keys and stock/price resolution before changing reads to the new tables. Keep a compatible read path and record rollback behavior. Verify with a local or staging database and migration fixtures, not destructive production reseeding.

## Prompt 6 Canonical ingredients formulations and directions

Extend the existing ingredient dictionary with canonical IDs and a normalized alias map. Add versioned formulations, full INCI, ingredient order, concentration values with units and known/unknown status, approved usage profiles and evidence references. Keep retinaldehyde and retinol distinct. Ingredient highlights must not stand in for complete formulation coverage. Build import and publication validation that flags ambiguous aliases, missing directions and partial coverage. Migrate known facts and leave unknown facts explicitly unresolved. Add tests for aliases containing concentrations and parenthetical marketing labels, including the audited exact-string matching failures.

## Prompt 7 Shared typed recommendation contracts

Implement strict TypeScript and Zod contracts for the V2 skin profile, observations, evidence groups, routine slots, exclusions and seven-day result. Include reactivity, tri-state sensitive answers, allergy history, budget, owned products, experience, adherence and optional eye/body preferences. Enforce the specification's field, array and byte limits. Reject unknown fields, nonfinite scores, invalid IDs and unsupported versions. Separate browser-safe contracts from server repositories. Define explicit V1 compatibility or recomputation behavior. Test boundary cases, including an empty allergy list that does not establish absence of allergies.

## Prompt 8 Personal records ownership and consent schema

Add the profile, consent, scan-session, feedback and routine-result extensions using compatible migrations. Enforce exactly one permitted owner, expiry fields, foreign keys and indexes described in the specification. Preserve existing user and routine IDs. Define server-generated guest ownership secrets with only hashes stored in the database. Separate photo processing, saving routines, progress photos and model-research purposes. No automatic sensitive-profile saving or public photo storage. Verify ownership and consent constraints using meaningful database tests, and document migration behavior for old saved routines.

## Prompt 9 Versioned knowledge releases and publication

Build the bounded knowledge base for ingredients, formulations, typed decision rules, interactions, Bayesian parameters, approved explanations and education answers. Use an enumerated predicate AST rather than executing rule strings. Compile validated records into a small immutable JSON release with a manifest, checksums and version IDs. Reject draft safety rules, broken sources, contradictory rules and incomplete restricted formulations at publication. Maintain a transactional active-release pointer, revocation and rollback. Reuse the existing CMS where practical. Demonstrate a valid fixture release and rejection cases without presenting synthetic clinical facts as approved knowledge.

## Prompt 10 Durable quotas and bounded API inputs

Implement the specification's initial endpoint quotas through the shared limiter interface. Preserve useful existing limits while adding owner, identifier and secondary trusted-IP keys, bounded payloads and Retry-After responses. Costly scans, OTP and sensitive credential work must not depend solely on process memory or silently bypass quotas during limiter failure. Keep scan admission and billable-attempt budgets durable. Protect signed payment webhooks with provider-aware validation and deduplication instead of customer quotas. Use atomic database operations initially; introduce Redis only if justified. Test concurrent admissions, limiter failures, identifier normalization and legitimate shared-network use.

## Prompt 11 Cached public rendering and client loading

Implement cached public HTML and immutable assets with narrow client-interaction boundaries. Keep private account, checkout, admin and saved-data responses private and uncached. Audit middleware and layouts for unnecessary database or session reads on public pages. Explicitly choose appropriate Next.js 15 caching and publish invalidation; do not turn the entire commerce app into a static export. Add batched price/stock refresh with bounded SKU lists, request deduplication, quote versions and expiry. Load no image model on the homepage. Measure request and transfer behavior and verify that stale public data cannot become an authoritative checkout total.

## Prompt 12 Cart and wishlist ownership synchronization

Complete authenticated cart and wishlist synchronization. Fetch existing server state and define a transactional guest-to-user merge policy by SKU, with quantity, stock and purchase caps. Explain adjustments and avoid silent cart loss. Reconcile on sign-in, sign-out and account changes, not just initial mount. Protect mutations with ownership and validation. Handle network failures and storage-disabled browsers without exposing another account's data. Test guest merging, same-page identity changes, concurrent updates and server-cart restoration.

## Prompt 13 Lightweight Bayesian inference core

Implement the pure TypeScript concern inference package and versioned parameter reader. Use stable log-odds arithmetic, likelihood ratios, neutral missing evidence and one contribution per accepted evidence group. Correlated quiz/photo observations must not be double-counted; raw model confidence is not a likelihood ratio. Validate finite distributions and calibration scope. Browser and server must produce identical results for identical inputs and releases. Include the specification's 0.20 prior, ratio 3, then independent ratio 2 arithmetic as a synthetic test only. Without validated likelihoods, retain reported priorities and conservative rules instead of manufacturing calibrated percentages. Do not add an LLM or model-training dependency to the runtime.

## Prompt 14 Candidate selection budget and owned products

Build the shared eligible-candidate selector. Apply approved safety, allergy, prescription, formulation coverage and irritation exclusions before ranking. Filter actual SKU availability and honor owned suitable essentials before proposing purchases. Enforce the new-product budget and optional-product distinction. Implement normalized concern, tolerance, affordability and owned-routine fit terms with explicit configuration. Commercial margin and raw co-purchase count must not override suitability. Return an honest empty treatment slot when no product qualifies. Test no-stock, zero-budget, partial coverage, owned items and substitution consistency.

## Prompt 15 Actual weekly routine planner

Implement a seven-day planner with distinct AM and PM sessions, ordered slots, product-specific approved frequency and introduction policies. Enforce session step caps and whole-plan interaction constraints, including owned products. Use bounded greedy selection with limited backtracking for the small catalogue. Revalidate after substitutions and edits. Never rely on prose to separate conflicting same-night treatments. Produce traceable exclusions and approved template explanations. Add invariant tests for frequency, day/session conflicts, ordering, step caps, deterministic results and valid no-treatment plans.

## Prompt 16 Private routine APIs and server recomputation

Implement validated create, retrieve, delete and feedback routine contracts. Recompute saved results server-side from inputs and the selected published knowledge release rather than trusting client result JSON. Read hosted observations through owned scan IDs. Add idempotency, consent checks, quota enforcement, private cache headers and consistent error shapes. Save snapshots and normalized day rows transactionally. Support guest ownership only through the chosen secret mechanism, with secure account migration. Verify foreign IDs, revoked releases, conflicting idempotency keys, expiry and reload retrieval.

## Prompt 17 Desktop routine finder and result experience

Replace the desktop quiz and results interface with the new core and APIs. Preserve a complete quiz-only path and separate experience from desired complexity. Show essential and optional products, owned items, actual weekly sessions, reasons, uncertainty, exclusions and current new-product spend. Editing budget or substituting a product must recompute and revalidate. Add explicit session-only versus saved state, save status and working private retrieval. Use the selected Nuvē visual system and accessible keyboard controls. Verify that loading, no match, stale quote, failed save and scanner-disabled states remain useful.

## Prompt 18 Knowledge assistant without an LLM

Build guided skincare help using approved education records, lexical search, structured questions and explanation templates. Ground answers in the published knowledge release and product directions. Show relevant evidence and uncertainty; unsupported questions should receive an honest scope response or a targeted clarification. Do not diagnose skin conditions or generate treatment instructions from unrestricted text. Keep price, stock and order questions connected to authorized domain services. Test retrieval quality, missing answers, stale releases, escaping and the absence of routine LLM calls.

## Prompt 19 Freeze and measure the live desktop reference

Capture the owner-selected current live Nuvē website at 1280, 1440 and 1920px desktop widths. Use the existing live screenshots and findings as evidence, then inspect current layout, typography, image crops, open/closed menu, section order, FAQ and intermediate animation states. Keep Lovi secondary and the earlier lavender video archived. Record measured values separately from proposed values, timing estimates and approved commerce differences. Inventory permitted assets and font files. The public Figma listing is not an editable node tree. Produce a reference matrix and capture fixtures that later visual tests can use; do not redesign the reference during this task.

## Prompt 20 Desktop design primitives and route shell

Implement the reusable desktop visual primitives and route shell from the measured Nuvē reference: Inter heading scale, Instrument Serif wordmark treatment, off-white and black surfaces, image-card proportions, pills, form fields and focus states. Add feature flags for the new storefront. Make component inputs accept real catalogue, account and routine data so design fixtures do not become fake production content. Preserve existing route behavior and staff permissions. Keep mobile and tablet UI adaptation deferred. Verify typography, semantic controls, keyboard access, loading states and image failure before applying the components broadly.

## Prompt 21 Full-screen hero and desktop menu replica

Implement the current live Nuvē hero geometry and desktop menu states using the approved reference captures. Match full-viewport photography, lower-left headline, upper-right supporting text and CTA, wordmark, trigger, pill dimensions and measured type scale. Reproduce the white menu overlay, large centered links, close behavior and support/legal placement. Route Avyora actions to the actual shop, finder, account, wishlist and bag. Use a comparison fixture for visual fidelity and record production differences. Add focus management, Escape close, reduced motion and image-failure fallback. Validate all three desktop widths and avoid introducing the older lavender or three-column hero.

## Prompt 22 Complete Nuvē-style landing page

Build the remaining desktop landing sections in the live reference order: About, Results grid, Vision, Features, Services, Testimonials, process/offer card, image break, FAQ, consultation and footer. Place Avyora catalogue, ingredients, routines and real support flows inside those compositions. Use real SKU prices and stock, genuine reviews and approved copy. Replace reference subscription pricing and unverified metrics with actual Avyora behavior. Wire every displayed CTA and form. Match settled and intermediate motion states without importing an unnecessary Framer application runtime. Verify section rhythm, crop, readability and direct shopping access.

## Prompt 23 Desktop catalogue product bag and checkout

Apply the new desktop components to collections, filters, product pages, wishlist, bag and checkout. Preserve galleries, variants, quantities, ingredient and usage details, related products and accessible controls. All surfaces must use the corrected shared quote flow from earlier prompts. Keep current server price checks, COD eligibility, Razorpay initiation/verification, inventory reservations and order state behavior. Handle changed prices, stock reductions, pending payments and retryable failures visibly. Test a complete desktop purchase flow with sandbox providers and retain the reproduced variant/quantity regression.

## Prompt 24 Desktop account orders journal and support

Redesign sign-in, sign-up, account, address management, saved routines, orders, tracking, invoice access, journal and legal/support surfaces in the Nuvē visual language. Preserve permissions, recovery and return URLs, private data controls and all existing routes. Add clear saved-routine expiry and scan deletion status. Public content must remain cached and indexable where appropriate; private records must not leak into shared caches or URLs. Verify route access, address CRUD, order ownership, keyboard forms and unavailable-content states. Do not invent business policy details.

## Prompt 25 Staff CMS and knowledge operations

Preserve and update the owner and manager workspaces, inventory and pricing edits, analytics, restock requests, packing and dispatch, CMS revisions/media and system reliability controls. Add knowledge release validation, publication, revocation and rollback controls with role checks and audit events. Prepare scan job, spending and expiry views for later integration without presenting nonexistent model results. Verify actual staff permissions and transactional behavior. Extend existing modules rather than replacing operations with a visual mock dashboard.

## Prompt 26 Optional desktop capture and private scan sessions

Implement desktop webcam capture and upload with an equally visible quiz alternative. Add processing consent, quality states, safe decoding, metadata stripping, file/pixel limits and cleanup of camera tracks and object URLs. Local photos stay in memory by default. Hosted uploads require owned sessions, durable quotas, server-generated private keys, bounded signing and real storage checks. Implement the private storage adapter and update narrow camera/CSP policies while retaining payment permissions. Verify denial, invalid files, multiple faces, expired upload and foreign sessions. Do not activate unsupported cosmetic inference yet.

## Prompt 27 Evaluated image inference and evidence integration

Integrate a commercially permitted, task-specific cosmetic analyzer only after its evaluation scope is documented. Use landmarks for crop and quality, not as a skincare diagnosis. Support validated browser ONNX inference where suitable and an optional bounded hosted worker with persisted owned observations, consent rechecks, leases, deadlines, retry budget and cancellation. Map calibrated model output into evidence groups used by the Bayesian core; it cannot override hard exclusions. If suitable weights or validation data are missing, complete the adapter and genuine failure paths with scan_enabled off, and report the missing dependency. Never publish a mock analyzer, guessed accuracy or unvalidated skin-health percentage as a working scan.

## Prompt 28 Feedback privacy lifecycle and observability

Add optional weekly adherence and tolerability feedback with conservative state transitions and approved guidance. Implement indexed expiry cleanup, private-photo deletion, consent withdrawal during queued work, account data controls and completion reporting. Monitor queue age, deletion backlog, routine constraint failures, quote changes and optional inference spending while preserving payment alerts. Keep raw photos, sensitive answers and signed URLs out of logs and analytics. Report observations as self-reported feedback rather than automatic clinical training labels. Test withdrawal, deletion retries, expiry and minimal event payloads.

## Prompt 29 Promotions loyalty reviews and newsletter

Implement advertised business features only with explicit business configuration. Add server-calculated bundle and basket promotions, gift eligibility and stock, append-only loyalty credit accounting with defined availability, expiry and reversals, refund allocation, verified-purchase reviews with moderation and a working consent-aware newsletter/unsubscribe flow. Make banners, drawer, checkout, invoice and fulfillment read the same rules. Preserve integer paise and existing shipping/tax policy unless a verified replacement is supplied. Undefined rules stay disabled and are listed clearly as unresolved; do not invent thresholds or promises merely to fill the UI. Test stacking, partial refunds, gift stock and duplicate credits.

## Prompt 30 Desktop acceptance performance and handoff

Run the complete desktop acceptance suite against the finished implementation. Verify all old route/features, Nuvē visual states at 1280/1440/1920px, keyboard use, zoom, reduced motion, prices/quantities, sandbox payments, routine invariants, browser/server parity, private ownership, quotas, optional scan failure and retention. Measure actual performance and costs against the document's proposed budgets; fix regressions rather than disabling checks. Reconcile every audit finding and previous prompt's outstanding work in the progress record. Prepare rollbackable flags and a reviewable final change report. Separate code/integration completion from missing approved content or model evidence. Stop at desktop handoff for owner testing; do not begin mobile UI or production deployment automatically.
