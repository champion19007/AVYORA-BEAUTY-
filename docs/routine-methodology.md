# Routine Finder — methodology

How `src/lib/routine-engine.ts` decides what to recommend, and why.

The engine is **deterministic**: identical answers always produce an identical
routine. No randomness, no time-of-day dependence. A customer who retakes the
quiz with the same answers sees the same result.

## Product resolution

Steps never hardcode a product id or display name. They reference a *slot*
(`src/lib/routine-slots.ts`), and the name and default size are read from the
catalogue at build time.

This exists because the previous engine hardcoded both, and they drifted: it
recommended `amino-acid-gel-cleanser`, `relief-sun-cream` and `retinal-ampoule`,
none of which were in the catalogue. The first of those was step 1 of *every*
morning routine and step 2 of every evening routine, so most recommended
routines contained steps that could not be linked or added to the bag.

`assertSlotsResolve()` runs at module load and throws if any slot dangles, and
`src/lib/__tests__/routine-engine.test.ts` asserts the same across a matrix of
profiles.

## Clinical rules

### Layering order

Morning runs cleanse → tone → treat → essence → (eye) → moisturise → SPF.

Vitamin C is placed **before** the hydrating essence layers rather than after.
It goes on clean skin so nothing blocks its penetration, and it belongs in the
morning where it complements sunscreen.

The previous ordering put the ferment essence at step 3 and vitamin C at step 4,
layering the active on top of a hydrating film.

### Vitamin C and retinol are split across the day

When both are indicated, vitamin C goes in the morning and retinol at night.
This is the standard split: it avoids stacking two irritants in one session,
and each sits where it does most good.

### Retinoids and exfoliating acids are never scheduled together

The engine explicitly alternates them. `getExfoliationFrequency` returns
"never on a retinol night" whenever a retinoid is recommended.

Stacking a retinoid with a chemical exfoliant in one session is the most
common self-inflicted barrier injury, and the previous engine did exactly
that — evening step 3 was an exfoliant and step 5 a retinoid, every night.

### Retinoid exclusions

Retinoids are withheld entirely when any of these hold:

| Condition | Reason |
| --- | --- |
| Pregnant or breastfeeding | Retinoids are contraindicated. The quiz now asks; previously it did not. |
| Under 18 | Not indicated at this age. |
| Very high reactivity | Tolerance is unlikely without supervision. |
| Skin currently irritated | Barrier repair comes first. |
| New to any routine (level 4) | One variable at a time. |

### Frequency ramps

Retinoids start at one or two nights a week and increase only in the absence
of flaking or stinging. Reactive skin starts lower and ramps more slowly.
Moisturiser buffering — moisturiser before *and* after the retinoid — is
offered to reactive users.

### Warnings

Every result carries a patch-test prompt and a note that this is general
guidance rather than medical advice. Retinoid users additionally get the SPF
requirement, the do-not-stack-with-acids rule, and a description of the normal
two-to-six-week adjustment period, so a routine reaction is not mistaken for
an allergic one.

## Sources

- [The Correct Skincare Order: A Dermatologist's Guide To Layering](https://www.iherb.com/blog/dermatologist-guide-to-layering-skincare/2296)
- [Layering Skincare Actives FAQ: Vitamin C, Niacinamide, Retinol](https://smytten.com/blogs/skincare/layering-skincare-actives-faq-vitamin-c-niacinamide-retinol)
- [Vitamin C, Niacinamide, Retinol & Sunscreen: Skincare Routine Order](https://nassifmdskincare.com/blogs/skincare-news/how-to-layer-vitamin-c-niacinamide-retinol-sunscreen)
- [How to Layer Skincare: Correct Order + What Not to Mix](https://achieveyourbestskin.com/2025/06/how-to-layer-skincare-like-a-dermatologist-morning-night-routine-guide/)
- [Retinol and Pregnancy: Why It's a No-Go and What to Use Instead](https://www.skin.software/journal/retinol-pregnancy)
- [Retinol Side Effects: Purge, Irritation, Safety](https://feelgoodpal.com/blog/retinol-side-effects)
- [Can Retinol Be Used By People Who Have Sensitive Skin?](https://www.forbes.com/sites/rachelburchfield/2026/07/29/can-retinol-be-used-by-people-who-have-sensitive-skin-heres-what-experts-have-to-say/)
