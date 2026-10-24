::part History and next steps
What is left before a full launch, how the system came to be what it is, and why it was built this way.

# What is left before launch {#launch}

Code is not what stands between Avyora and a full launch. These are the remaining items, most of which only the owner can supply.

## Must do before taking real orders

| # | Item | Why | How |
| --- | --- | --- | --- |
| 1 | Move Vercel to Pro | Hobby forbids commercial use and pauses features at its limits | Vercel → Settings → Billing (about $20 a month); then make the sweep run every 15 minutes |
| 2 | Business details | Policy pages carry `[TO CONFIRM]`; Cashfree reviews them | Registered name, address, GSTIN, grievance officer, support reply time, return and delivery windows. `npm run check:launch` lists each one |
| 3 | Cashfree live keys | Payments are in test mode | Complete KYC, set live keys, register the webhook |
| 4 | Verified products | The catalogue is in sample mode and refuses real orders | Product records with full ingredient lists and evidence (`npm run catalogue:validate`), then `NEXT_PUBLIC_CATALOGUE_MODE=verified` |
| 5 | Approved photography | Placeholder images, one showing another brand's label | Photos for the slots in `docs/product-onboarding.md` |
| 6 | Count the stock | Uncounted SKUs cannot be sold | Stockroom, or `npm run db:seed-inventory` |
| 7 | Nightly backups | Only 6 hours of history today | Create a private S3-compatible bucket and set the six `BACKUP_*` repository secrets |
| 8 | Rotate the Neon password | It appeared in tool output during development | Neon → Roles → reset, then update `DATABASE_URL` in Vercel |

## Should do soon after

| Item | How |
| --- | --- |
| Shiprocket | Create the API user and webhook (Chapter [[shiprocket]]), apply migration 0022 |
| AI skin chat | Create an Anthropic key with a spend limit, set `ANTHROPIC_API_KEY` |
| WhatsApp alerts | Renew the Meta token |
| Email domain | Verify a sending domain (Resend) or keep Gmail with an app password |
| Error alerts | Set up Sentry (`SENTRY_DSN`) with an alert rule |
| Web application firewall | Vercel Firewall Bot Protection, or Cloudflare |
| Paid Neon plan | When traffic grows: more compute, longer history |
| Reviewed skincare knowledge | Directions, cautions, rules and interactions approved by a qualified reviewer, then published, so routines can include treatments |
| Delete leftover Neon branches | `loadtest-2026-10-12`, `cart-verify-prompt2`, `catalog-0014-rehearsal`, `rehearsal-0020-0021` (with approval) |

## Waiting for approval

| Item | Status |
| --- | --- |
| Migration 0022 (courier columns) | Applied to the local acceptance database only. Needs approval for production |
| Branch `fix/payment-backout` | Holds the payment back-out fix, the AI skin chat, Shiprocket, the stock autopilot, owner two-step sign-in, the replay-key fix, the outage fallback and the stockroom Help page. Not yet committed or merged |

## Not built, by design

| Feature | Why not | What it would need |
| --- | --- | --- |
| Coupons, bundles, free gifts, loyalty points | No business rules exist; advertising them without checkout support would be misleading | Eligibility, stacking, caps, expiry and refund rules; a points ledger |
| Automatic supplier ordering | Approving spend needs supplier details and a budget rule | Suppliers, prices, lead times, an approval limit |
| Face-photo analysis | No evaluated, licensed model | A model with a commercial licence, evaluated per skin tone, with calibrated outputs |
| Customer self-service cancellation and refunds | No approved rule | A cancellation window and refund policy |
| Newsletter sending | No sending tool | A mailing service that honours unsubscribes |
| Mobile and tablet layouts | Desktop first, by the owner's choice | Approval of the desktop design |

# Launch-day checklist {#launchday}

A step-by-step order for going live, once the items in Chapter [[launch]] are in hand. Tick each line; do not skip ahead, because each stage depends on the one before.

## One week before

| Done | Task |
| --- | --- |
| ☐ | Vercel on the Pro plan; sweep schedule changed to every 15 minutes in `vercel.json` |
| ☐ | Neon password rotated; `DATABASE_URL` updated; site redeployed and `/api/health` answers "ok" |
| ☐ | Nightly backup secrets set; one manual backup run; the file seen in the bucket |
| ☐ | One restore rehearsed into a scratch Neon branch, then the branch deleted |
| ☐ | Business details filled in; `npm run check:launch` reports nothing outstanding |
| ☐ | Policy pages reviewed by a lawyer; grievance officer named |
| ☐ | Verified product records validated; photography uploaded; the wrong-brand stock photo gone |
| ☐ | Cashfree KYC complete; live keys set; webhook registered |
| ☐ | Shiprocket API user, pickup address and webhook set; wallet topped up; migration 0022 applied with approval |
| ☐ | Email: a verified domain on Resend, or Gmail within its daily limit; `OWNER_EMAIL` set |
| ☐ | WhatsApp: permanent token and an approved template |
| ☐ | Anthropic key with a monthly spend limit (if the chat is part of launch) |
| ☐ | Sentry alerts, Vercel Firewall Bot Protection |
| ☐ | Staff logins set; the owner has signed in with the emailed code; the manager has signed in and read the Help page |

## The day before

| Done | Task |
| --- | --- |
| ☐ | Build with `NEXT_PUBLIC_CATALOGUE_MODE=verified`; `ALLOW_SAMPLE_ORDERS` **not** set |
| ☐ | `npm run check:env -- --production` passes |
| ☐ | Stock counted for every product in the stockroom |
| ☐ | Prices and any launch offer set in the owner console, with an end date |
| ☐ | Google sign-in app published; production redirect address registered |
| ☐ | Leftover test orders and Neon test branches cleaned up (with approval) |

## Launch morning: a real end-to-end test

Use your own card or UPI and real address. Every step should be checked before telling anyone the shop is open.

1. **Browse.** Home, collections, a product page: prices and "In stock" correct.
2. **Online order.** Buy one low-priced item with Pay online. Check:
   - the Cashfree page shows the right amount;
   - after paying, the confirmation page shows the order;
   - the confirmation email arrives with a working order link;
   - the owner email and WhatsApp alert arrive;
   - the order appears in the owner console as paid and in the stockroom dispatch queue.
3. **Back-out.** Start another order, press Back on the Cashfree page. Check "nothing was ordered" appears and no email or alert was sent.
4. **Cash on delivery.** Place a COD order. Check the risk check approved it and it appears for dispatch.
5. **Dispatch.** In the stockroom: Mark packed, Book courier, print the label. Check the tracking number on the order page.
6. **Tracking.** When the courier collects, check the order moves to "On its way" and the shipping email arrives.
7. **Refund.** Refund the online order from the Cashfree dashboard.
8. **Chat.** Sign in as a customer and send one message to the skin chat.
9. **Logs.** Vercel → Logs: no errors from the test. Owner console → System: nothing failed.

## The first week

| Daily | What to watch |
| --- | --- |
| Morning summary | Arrives every day around 08:45; orders and stock look right |
| Owner console → Orders | Held COD orders decided the same day; nothing left needing attention |
| Owner console → System | No failed or dead deliveries |
| Vercel → Usage | Function calls, CPU and bandwidth well under the plan |
| Neon → Monitoring | Database CPU not pinned; no connection errors |
| Anthropic → Usage | Chat spend in line with ₹0.50 per active person |
| Shiprocket | Pickups happening; no stuck parcels |
| Cashfree | Settlements match the owner console's revenue |

If anything looks wrong, Chapter [[runbooks]] has the steps; the quickest safe move after a bad deployment is promoting the previous one in Vercel.

# History of the build {#history}

The system was built in a 30-step plan between 7 and 10 October 2026 (`docs/avyora-30-implementation-prompts.md`), against a written specification and an audit of the earlier site, then extended from 12 to 21 October. The full record, with every test count and verification, is `docs/implementation-progress.md`.

## Foundations (7 to 8 October)

| Step | What changed |
| --- | --- |
| 1. Build baseline | A portable build; a rule that a deployment fails rather than bake an outage into cached pages; stable tests |
| 2. Bag prices | The bag priced every line from a frozen copy of the product; now each SKU is priced with the same rule as checkout, quantities and sizes are honoured, and a changed price refuses the order |
| 3. Routine safety | Irritated and very reactive skin get no actives; "prefer not to say" on pregnancy is never treated as "no"; beginners get three steps; no invented directions |
| 4. Honest claims | Removed offers the checkout did not apply ("Buy 2, Get 3rd Free", cashback, free gifts), absolute claims and a dummy WhatsApp number; added automated claim checks |
| 5. SKU identities | Stable ids for every size; catalogue tables; migration rehearsed and reversible |
| 6. Ingredients | A canonical dictionary with ambiguity handling ("vitamin C" never silently means one thing); formulations and directions as reviewable records |
| 8. Consent | Nothing personal is saved without permission; everything saved expires |
| 9. Knowledge releases | Compiled, checksummed, immutable releases with rollback and revocation |
| 10. Durable limits | Rate limits moved from server memory to Postgres; trusted client addresses; bounded request bodies |
| 11. Caching | Pre-built public pages; private pages never cached; the shared bundle cut from 195 KB to 103 KB |
| 12. Account sync | Bag and wishlist merge on sign-in without inflating quantities |

Step 7 (shared typed recommendation contracts) was skipped in the order the steps were given, and its role was absorbed by steps 16 and 17.

## Personalisation (8 October)

| Step | What changed |
| --- | --- |
| 13. Inference | A Bayesian concern ranker that refuses to show percentages without validated parameters |
| 14. Selection | Safety exclusions before ranking; budget in whole paise; owned products first |
| 15. Weekly planner | A real seven-day schedule that validates every session |
| 16. Routine API | Server recomputation; idempotent saves; owner scoping; guest-to-account transfer |
| 17. Routine finder | The new questionnaire and results, computed on the device with the same engine as the server |
| 18. Ask Avyora | On-device answers with no AI model and no data leaving the device |

## Design and experience (8 to 9 October)

| Step | What changed |
| --- | --- |
| 19. Reference | The target design measured at three widths |
| 20 to 22. Design system, hero, landing | Rebuilt to the measured reference (section heights within a few pixels); real products and prices, no invented reviews |
| 23. Shop and checkout | The design applied across shopping pages without changing their logic |
| 24. Accounts | Saved routines page; address ownership tests |
| 25. Staff | Knowledge operations; support messages |
| 26 to 27. Face scan | Built and switched off; no model, no invented scores |
| 28. Privacy lifecycle | Weekly feedback, consent withdrawal, expiry sweeps, broader log redaction |
| 29. Reviews and newsletter | Verified-purchase reviews with moderation; double opt-in newsletter (switched off) |
| 30. Acceptance | Three-width acceptance pass; handoff document |

## After the plan

| Date | Work |
| --- | --- |
| 9 October | Cashfree replaced Razorpay for online payments |
| 10 October | Re-audit: 22 findings fixed; product onboarding validator; sample and verified catalogue modes |
| 12 October | Backing out of payment no longer orders anything; online orders announced only when paid; load test to 500 simultaneous visitors; production error review; architecture map with graphify; testing strategy |
| 12 October | AI skin chat with Claude Haiku 5.5, server-side urgent-symptom detection, signed-in only, ₹0.50 per person per day |
| 21 October | Security review (replay-key fix); Shiprocket booking and tracking; COD sales counted as revenue once delivered; returned parcels restocked; "on its way" emails; stock autopilot and morning summary; owner two-step sign-in; stockroom Help page; storefront survives a database outage; returned orders leave the dispatch queue and show "Returned" to the customer; analytics count only real sales; expired sign-in codes cleaned up daily; dead "Forgot?" link fixed |

## Quality over time

| Date | Tests passing |
| --- | --- |
| 7 October (start) | 403 |
| 8 October | 852 |
| 9 October | 911 |
| 10 October | 987 |
| 12 October | 1,086 |
| 21 October | 1,131 |
