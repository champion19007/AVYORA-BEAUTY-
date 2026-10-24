# Promotion builder

`src/components/admin/promotion-builder.tsx` exports `PromotionBuilder`, a client component using React state/effects and Tailwind utilities. It is included at `/admin/pricing`, behind the existing owner authentication. Individual product price editing still works separately.

The default action prepares JSON in memory and offers a download. It does not persist, schedule, or publish promotions. Reloading loses the draft. Categories in the admin instance come from the catalogue. The reusable component includes sample category options when no categories are supplied.

## Connect an API

Provide an optional `onSubmit(payload): Promise<void>` from a client wrapper. Its rejection displays a retryable error and preserves the form. While waiting, the promotion controls are disabled. Without the callback, submission only generates JSON. The component imports no icon or component library and adds no dependencies.

```tsx
'use client';

import { PromotionBuilder } from '@/components/admin/promotion-builder';

export function ConnectedPromotions() {
  return (
    <PromotionBuilder
      onSubmit={async (payload) => {
        // Implement this authenticated server endpoint for your commerce platform.
        const response = await fetch('/api/admin/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Promotion submission failed');
      }}
    />
  );
}
```

The example endpoint is an integration example, not an existing route. Keep provider credentials on the server. Before enabling publication, implement owner authorization, CSRF protection, runtime schema validation, idempotency, persistence, audit history, and provider error handling. The API must enforce every safeguard again during checkout against authoritative prices and eligible items. A browser preview cannot enforce a commercial rule.

## JSON contract, version 1

| Field | Meaning |
| --- | --- |
| `currency` | `USD` or `INR`; changing currency reinterprets entered amounts, without exchange conversion. |
| `conditions.match` | All conditions must match; any one selected category qualifies. |
| `conditions.categoryIds` | Deduplicated, sorted catalogue identifiers. Empty/unknown categories are rejected. |
| `conditions.minimumSpend.amountMinor` | Eligible-item subtotal before discounts, excluding tax/shipping. Excluded sale items must not contribute. |
| `reward` | Discriminated union: `percentage` with integer `basisPoints`, or `fixed_amount` with integer `amountMinor`. Applies to each eligible unit. |
| `safeguards` | Coupon blocking, sale exclusions, maximum percentage discount, rounding and single-best-automatic-offer policy. These must be implemented by the consuming engine. |
| `schedule` | Explicit UTC instants and the operator's chosen timezone. Start inclusive, end exclusive. `startsAt: null` means activate when published; `endsAt: null` means manual stop. |

One hundred basis points equals 1%. One hundred minor units equals $1 or ₹1. Decimal inputs are parsed from digits. Fractional minor-unit discounts round down. Fixed discounts are capped per unit by `maxDiscountBasisPoints`, so a $100 fixed discount with a 50% ceiling on a $50 product discounts only $25. Percentage discounts above the configured ceiling are rejected. Raising the ceiling above 50% or weakening either toggle shows a margin warning. A deliberate 100% ceiling can permit free items.

Money inputs are bounded at 1,000,000 major units. Names are trimmed and limited to 80 characters. Both supported currencies use two decimals. Scheduled starts must be in the future; ends must be after both now and the start. IST and UTC have fixed offsets, so conversion is independent of the browser's timezone. Hidden schedule fields are omitted from the compiled schedule through null values.

## Preview semantics

The product is explicitly illustrative: $50, or ₹50 when INR is selected. It is not a catalogue product or real price. The card responds immediately to form inputs and sample basket controls. The default 20% offer shows the original price struck through, a $40 price and a 20% OFF label.

The sample basket tests category, eligible spend, coupon presence and existing sale status. Its subtotal is independently adjustable for threshold testing. The preview assumes an active schedule and says so; it is not a simulation of whether the current clock is inside a scheduled window. Name and schedule errors block export even though an otherwise valid discount can still be previewed.

Draft changes clear an earlier export to prevent downloading stale rules. Generated JSON stays in memory; no browser storage or customer data is used.

## Design decisions

- Design read: a calm Avyora operations workspace for non-technical owners; energy 1, rhythm 2, motion 1.
- Navy and ivory continue the existing brand palette; gold marks the actual discount, not decorative status.
- Existing body and headline fonts preserve the admin identity and separate task headings from editable amounts.
- A form beside a sticky preview keeps the customer's resulting price visible while editing. The layout stacks below the desktop breakpoint.
- Section spacing groups eligibility, discount, safeguards and scheduling. Cards isolate the storefront simulation from operational inputs.
- Native controls, visible labels, textual errors and focus outlines support keyboard operation. Switches expose their checked state to assistive technology.
- No new logos, product images, metrics, navigation, icon packages, decorative animations or external assets.
- The builder has a deliberately light ivory surface with explicit foreground/control colors, including inside the existing dark admin shell.

## Validation

Run `npx vitest run src/components/admin/__tests__/promotion-model.test.ts` for the money, eligibility, safeguards, schedule and JSON contract checks. Run TypeScript and ESLint for the component. Interactive browser verification must cover form errors, every select/switch, scheduling, export/download, and an API adapter's pending/error states before wiring publication.

Implementation checks completed:

- PASS: 13 pricing and contract tests, including $50 → $40, fractional rounding, caps, threshold boundaries, unknown categories and invalid schedules.
- PASS: React server rendering for the default discount card, switch state markup and the empty-category state.
- PASS: Tailwind compilation of the project styles, including the new component utilities.
- PASS: TypeScript validation, ESLint for changed TypeScript/React files, and Prettier formatting checks.
- PASS: computed contrast for navy on ivory (13.43:1), secondary text on ivory (7.14:1), control boundaries on white (4.76:1), and navy on the discount label (11.33:1).
- Design review: brand colors and fonts reused; form/preview hierarchy and motion match the declared dials; all new controls have state or event handlers; no external assets, invented metrics or promotional claims.
- Interactive verification remains incomplete: browser security rejected acquiring the local tab. No browser click-through, viewport inspection, download interaction or API adapter interaction is claimed. Component rendering and logic checks do not replace those checks.
