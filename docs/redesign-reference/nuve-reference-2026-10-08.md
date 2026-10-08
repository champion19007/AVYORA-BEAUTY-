# Nuvē desktop reference package (frozen 8 October 2026)

The owner selected the **current live Nuvē website** as the desktop visual authority:

| | |
| --- | --- |
| Reference | https://nuve-beauty.framer.website/ |
| Archived | The earlier lavender video (`frame-*.png`, `contact-sheet.png`): not a baseline |
| Secondary inspiration | Lovi (`lovi-live-hero.png`) |
| Figma | Only the public Community listing and preview of the Lovi file were seen. No editable layers, frames or components were accessed, and none are claimed. |

Captures are for internal design comparison only. They are third-party content and must not ship in the Avyora site.

## 1. Capture record

| Item | Value |
| --- | --- |
| Captured | 8 October 2026, 14:32 UTC onwards (`nuve-live-2026-10-08/capture.json`) |
| Browser | Microsoft Edge 156.0.4314.8, headless (Chromium), driven over the DevTools protocol by `scripts/capture-reference.mjs` |
| Device scale | 1 (CSS pixels = image pixels) |
| Scrollbars | Hidden, so content width = viewport width. In a normal desktop browser with a classic 15 px scrollbar, content is 15 px narrower: the 7 October in-app capture measured 1265 px at 1280. |
| Motion | `prefers-reduced-motion: no-preference`, plus a second load with `reduce` |

| Viewport | Height | Content width | Page height | Folder |
| --- | --- | --- | --- | --- |
| 1280 | 800 | 1280 | 11,131 | `nuve-live-2026-10-08/w1280/` |
| 1440 | 900 | 1440 | 11,400 | `nuve-live-2026-10-08/w1440/` |
| 1920 | 1080 | 1920 | 11,940 | `nuve-live-2026-10-08/w1920/` |

**Files in each width folder:**

| File | Contents |
| --- | --- |
| `01-hero-closed.png` | Hero with the menu closed |
| `02-hero-cta-hover.png` | Pointer over "Start your glow" |
| `03-menu-open.png` | Navigation overlay open |
| `04-faq-closed.png`, `05-faq-first-expanded.png`, `06-faq-all-clicked.png` | FAQ states |
| `07-hero-reduced-motion.png` | Hero with reduced motion |
| `scroll-NN.jpg` | One frame per viewport height, top to bottom (the most reliable full-page record) |
| `section-NN-<name>[-2].jpg` | Each section scrolled to the top of the viewport (a second frame when taller than the screen) |
| `measurements.json` | Every computed value below, and more |

To re-run (the same script serves the Avyora comparison in prompts 20–22):

```
node scripts/capture-reference.mjs https://nuve-beauty.framer.website/ docs/redesign-reference/nuve-live-2026-10-08
```

## 2. Section order and geometry

The values are rendered boxes from `getBoundingClientRect` and computed padding (top/right/bottom/left).

| # | Framer layer | Purpose | Height 1280 / 1440 / 1920 | Padding | Background |
| --- | --- | --- | --- | --- | --- |
| 0 | Desktop Close | Header (wordmark, menu button) | 76 | 20/40/20/40 | transparent |
| 1 | Hero | Full-bleed portrait, copy, CTA | **100vh**: 800 / 900 / 1080 | 0 | image |
| 2 | About Us | Image, large text, two stat cards | 793 / 762 / 762 | 150/0/100/0 | #FAFAFA |
| 3 | Results | "Results" + 2×2 image cards | 1608 | 100/40/200/40 | transparent (#FAFAFA page) |
| 4 | Vision | Full-bleed portrait + statement | **100vh** | 100/40/100/40 | image |
| 5 | Features | Heading + six numbered process cards | 927 | 200/40/200/40 | page |
| 6 | Services | Full-bleed image, large two-tone text | 986 | 150/40/150/40 | image |
| 7 | Testimonials | "Smart Skincare": card, image, quote | 945 | 200/40/100/40 | page |
| 8 | Pricing | Scan / Understand / Adapt + offer card | 1005 | 100/40/200/40 | page |
| 9 | Image | Full-bleed image break, **position: sticky** | **100vh** | 100/40/100/40 | image |
| 10 | FAQ | Heading, copy, accordion | 944 | 200/0/200/0 | #FAFAFA |
| 11 | CTA | Consultation form over image | 993 | 150/40/150/40 | #FFFFFF / image |
| 12 | Desktop (footer) | Wordmark, columns, credits | 530 | 0 | dark image |

**Container rule.**
- At 1280, content runs edge to edge inside the 40 px side padding: content 1200 wide, from x=40.
- At 1440 and 1920, section content is a **centred 1240 px column**: x=100 at 1440, x=340 at 1920.
- The hero copy, header and menu stay pinned to a **40 px gutter at every width** (hero headline at x=40 in all three).

## 3. Typography (computed)

Faces: **Inter** (400, 500 used; served from Framer's own copy) and **Instrument Serif** 400 (Google Fonts), wordmark only. Values are identical at all three widths: the type does not scale with the viewport.

| Role | Font | Size / line height | Weight | Letter spacing | Colour | Example |
| --- | --- | --- | --- | --- | --- | --- |
| Hero headline | Inter | 100 / 100 | 500 | -6 px | #FFFFFF | "Your partner for natural daily glow" (two lines, box 900 wide) |
| Section heading | Inter | 80 / 88 | 500 | -3.2 px | #1A1A1A | "Results", "Features", "FAQ" |
| Large figure | Inter | 48 / 48 | 500 | -1.92 px | #1A1A1A | "98" (stat card) |
| Footer wordmark | Instrument Serif | 48 / 48 | 400 | -0.8 px | #1A1A1A | |
| Menu links, editorial statements | Inter | 40 / 52 | 500 | -1.6 px | #1A1A1A, #FFFFFF on images; second tone #ADADAD | |
| Card titles, process heading | Inter | 32 / 35.2 | 500 | -1.28 px | #FFFFFF on image, #1A1A1A, second tone #696666 | |
| Header wordmark | Instrument Serif | 28 / 33.6 | 400 | -0.8 px | #FFFFFF on hero, #1A1A1A in sticky header and cards | |
| About paragraph (word-split) | Inter | 28 / 30.8 | 500 | -1.12 px | #1A1A1A with #696666 words | |
| Contact line | Inter | 24 / 28.8 | 500 | -0.96 px | #1A1A1A | |
| Quote | Inter | 22 / 28.6 | 500 | -0.66 px | #1A1A1A | |
| Hero supporting copy, prices | Inter | 20 / 26 | 500 | -0.6 px | #FFFFFF / #1A1A1A | |
| Eyebrow, body | Inter | 18 / 23.4 | 400 or 500 | -0.3 px | #FFFFFF uppercase (eyebrow), #696666 (body) | |
| Button labels, links, small copy | Inter | 16 / 20.8 | 500 | -0.64 px | #1A1A1A, #696666, #FFFFFF, #ADADAD | |
| Captions, footer small | Inter | 14 / 19.6 | 400 or 500 | -0.56 px | #696666, #FFFFFF | |

**Letter spacing.** Inter tracking is **−4 percent of the font size** at 14, 16, 24, 28, 32, 40, 48 and 80 px. The exceptions:
- −3 percent at 20 and 22 px.
- −0.3 px at 18 px.
- −6 percent on the 100 px hero headline.

## 4. Colour (computed, by frequency)

| Token | Value | Use |
| --- | --- | --- |
| Page | `#FAFAFA` rgb(250,250,250) | Page and section surfaces |
| Ink | `#1A1A1A` rgb(26,26,26) | Text, dark pill buttons |
| Muted | `#696666` rgb(105,102,102) | Body copy, second-tone words |
| Faint | `#ADADAD` rgb(173,173,173) | Third tone on images, fine print |
| Card | `#FFFFFF` | Cards, light pill buttons, overlay text |
| Line | `#E8E8E8` rgb(232,232,232) | Borders |
| Glass | `rgba(255,255,255,0.24)` | Translucent chips on photos |

Anchors compute to the browser-default `rgb(0,0,238)`: Framer styles the child text, so the visible colour is the child's. Never copy the anchor colour.

## 5. Components (1440 unless stated)

| Component | Measured |
| --- | --- |
| Header | 76 high, 20/40 padding. Wordmark 45×34 at (40, 20); menu button 34×20 at the right gutter. **In flow, not fixed**: it scrolls away. A light sticky variant (dark wordmark, ink menu icon) appears later in the page (seen in the FAQ frames). |
| Hero CTA "Start your glow" | **155×49**, radius **100 px**, padding 14/24, white fill, label 16/20.8 Inter 500 #1A1A1A. At (1245, 222) at 1440: its right edge on the 40 px gutter. |
| Dark pill buttons | Same 49 high, radius 100, ink fill, white label. "Discover Nuvē" 340 wide; "See our results" 240; "Start your glow" 155. |
| Consultation button | **200×60**, radius **40 px**, padding 18/24, white. |
| Results image cards | **616×585** at 1440 (2 columns, **8 px gap**, 1240 container); radius **18 px**; image object-fit cover, centred; title 32 px white, chip label 24 px. At 1280: (1200−8)/2 = 596 wide. The spec's 588 was measured with a scrollbar. |
| About stat cards | 388×347, radius 18, white and image; "98 %" figure 48 px. |
| About image | 392×512, radius 18. |
| Process cards (Features) | **408×194**, radius 18, white, 3 columns × 2 rows, **8 px gaps**; numbered 01–06. |
| Testimonial row | Left card 304×515 white; image 616×515; quote card 304×515; radius 18; 8 px gaps. Avatar 47 px circle. |
| Pricing | Three step cards **408×192** (radius 18, content inset 32 px, inner radius 12); offer card **824×593** radius 18 with a #FAFAFA inner panel 800×401 radius 12. |
| FAQ | Questions in white rows, radius ~18, 8 px apart; ink circular toggles (+ closed, − open). **One item open at a time**: opening another closes the previous (page height grows 41 px once, then stays). |
| Menu overlay | White, near-full-height panel. Five centred links ("Home, Results, About, Careers, Contact") in **Inter 40/52, 500, -1.6 px**, about 68 px apart. "Support / hello@nuve.com" (16 px muted over 24 px ink) bottom-left; "Privacy Policy, Terms of Service" (16 px) bottom-right; close (×) replaces the menu icon in place. The bottom of the hero stays visible under the panel at 1280×800. |
| Footer | Dark full-bleed image. Wordmark 48 px; three link columns (pages, social, legal) at 26 px rows, 38 px pitch; "© 2026 Nuvē" 16 px at 80 percent opacity. |

## 6. Imagery and crops

All images are `object-fit: cover`, centred (`50% 50%`). The hero is square-cornered and full-bleed; cards are radius 18.

| Slot | Rendered box (1440) | Source pixels | Notes |
| --- | --- | --- | --- |
| Hero | 1440×900 (100vh) | 1440×810 WebP | Upscaled vertically by cover; face centred |
| About portrait | 392×512 | 392×588 | Portrait 3:4 |
| About stat image | 388×366 | 388×388 | Square |
| Results cards ×4 | 616×585 | 1440×822 and 616×351 | Landscape sources cropped to near-square |
| Vision | 1440×945 | 2400×1350 | Full-bleed |
| Services | 1440×986 | 1440×822 | Full-bleed |
| Testimonial centre | 616×515 | 616×346 | |
| Image break | 1440×945 | 1344×768 | Sticky |
| CTA background | 1440×993 | 1440×803 JPG | |

## 7. Motion (observed; timings proposed)

The capture can read states, not Framer's JavaScript-driven timings: `document.getAnimations()` returned **no** running Web Animations at any width, because Framer animates with its own runtime.

| Behaviour | Observed state | Timing |
| --- | --- | --- |
| Section reveals | Elements start at opacity 0 and translateX(−20 px) (for example the About image wrapper), and settle at opacity 1, no transform, after scrolling into view | **Proposed:** 600 ms, ease-out, staggered 60–80 ms |
| Hero entrance | Hero text, CTA and image carry `will-change: transform`; settled within 4 s of load | **Proposed:** 700 ms, ease-out; image scale 1.05 → 1 |
| Word-by-word About text | The paragraph is split into one span per word, in two tones | **Proposed:** opacity step per word as it scrolls through the viewport |
| CTA hover | Each label is rendered twice ("Start your glow Start your glow"), a stacked text-roll; at rest the second copy is hidden | **Proposed:** 300 ms vertical swap |
| Menu open | Overlay slides down from above (menu links measured at negative y mid-transition) | **Proposed:** 500 ms ease-out |
| Header | Scrolls away with the page; a light sticky header is present further down | Not timed |
| FAQ | Height expands for the open item (+41 px on the first), the toggle switches + to − | **Proposed:** 300 ms |
| Image break | `position: sticky` full-bleed image | Native scroll |

**Reduced motion** (emulated `prefers-reduced-motion: reduce`):
- The hero renders identically.
- The not-yet-revealed elements still start hidden (the About image is still at opacity 0, −20 px). The live site appears to **ignore the preference** for reveals.
- **Avyora must not copy this.** Under reduced motion, render final states immediately (spec section 3).

## 8. Fonts and assets: availability and replacements

| Asset | Source | Can Avyora use it? | Plan |
| --- | --- | --- | --- |
| Inter | Framer-hosted copy (`framerusercontent.com/assets/*.woff2`); also on Google Fonts | **Yes**: SIL Open Font License | Self-host from Google Fonts via `next/font/google` (weights 400, 500); never hotlink Framer's files |
| Instrument Serif | Google Fonts (`fonts.gstatic.com/s/instrumentserif/...`) | **Yes**: OFL | Self-host via `next/font/google` (400) for the wordmark only |
| Fragment Mono | Declared, not used | n/a | Not needed |
| Current Avyora faces | Jost (Google, OFL); Foglihten (local, OFL licence file in `src/app/fonts/`) | Yes | Replaced on the landing page by Inter and Instrument Serif per the spec; keep only if the owner wants Foglihten as the Avyora wordmark (an intentional difference) |
| All Nuvē photographs (hero, results, vision, services, testimonial, image break, CTA, footer, avatars) | `framerusercontent.com/images/...` (template content) | **No**: licence and model releases unknown; template imagery, not Avyora's | **Unresolved.** Needs approved Avyora campaign and product photography in the measured ratios (section 6) |
| Avyora product and hero images today | 36 Unsplash photos (`src/lib/placeholder-images.json`), generic stock, not Avyora products | Licence allows use, but they are **not real product photos** | **Unresolved.** Real packshots per SKU are needed before commerce cards claim to show the product |
| Icons (menu lines, plus/minus, arrows, stars) | Inline SVG in the template | Do not copy | Redraw or use `lucide-react` (already installed) |
| "Made in Framer" badge | Framer | No | Not part of the design |
| Copy, testimonials, "98 %", "$29" pricing | Template content | No | Replaced with approved Avyora copy, real products and prices (section 10) |

## 9. Comparison checklist (for prompts 20–22)

Capture the Avyora page with the same script at the same widths, then compare frame by frame. A section passes when every row holds at 1280, 1440 and 1920.

| # | Reference section | Avyora counterpart | Must match | Tolerance |
| --- | --- | --- | --- | --- |
| 0 | Header | Avyora wordmark, menu button (+ compact bag and account) | 76 high; wordmark at (40, 20); menu on the right gutter; scrolls away; sticky light variant | ≤ 4 px anchors |
| 0b | Menu overlay | Shop, Routine Finder, Ask Avyora, Journal, Account, Track order | White panel; centred 40/52 links; support bottom-left; legal bottom-right; focus trapped and restored; Escape closes | ≤ 4 px |
| 1 | Hero | Avyora campaign portrait; routine-finder CTA top right; headline bottom left; Shop reachable | 100vh; square edges; 100/100 −6 px headline at x=40, two lines ≤ 900 wide; 20/26 copy right-aligned at the gutter; 155×49 white pill (width may fit text) | ≤ 4 px; headline line breaks identical |
| 2 | About Us | Skin, budget and tolerance explanation | Two-tone 28/30.8 paragraph; 392×512 portrait; two 388×347 cards; no unverified statistic | ≤ 4 px |
| 3 | Results | Shop by concern, best sellers, new launches | 2 columns, 616×585 (1440), 8 px gap, radius 18, cover crops; price, SKU choice and add action inside the card area | ≤ 4 px |
| 4 | Vision | Brand approach statement | 100vh full-bleed; 40/52 white statement, second tone | ≤ 4 px |
| 5 | Features | Quiz, optional photo, weekly routine, ingredient guidance, budget and owned products, follow-up | 3×2 cards 408×194, 8 px gaps, numbered 01–06 | ≤ 4 px |
| 6 | Services | Routine finder, catalogue, ingredient knowledge, journal | Full-bleed image; 40/52 two-tone text | ≤ 4 px |
| 7 | Testimonials | Product education (or genuine reviews once they exist) | 304 / 616 / 304 × 515 row, radius 18, 8 px gaps | ≤ 4 px |
| 8 | Pricing | Scan / Understand / Adapt steps + a real routine preview or bundle quote | Three 408×192 cards + 824×593 card with inner #FAFAFA panel | ≤ 4 px |
| 9 | Image break | Approved Avyora photograph | 100vh, sticky, focal point centred | ≤ 4 px |
| 10 | FAQ | Routines, scan limits, shipping, returns, data saving | 80/88 heading; muted intro; white rows; one open at a time; + / − toggle; keyboard operable | ≤ 4 px |
| 11 | CTA / consultation | Real support or a consent-aware callback request | Full-bleed image; form composition; 200×60 radius-40 button; truthful response time | ≤ 4 px |
| 12 | Footer | Shop, routine finder, track order, account, wishlist, policies, journal, newsletter | Dark image; 48 px wordmark; three link columns at 38 px pitch | ≤ 4 px |
| All | Type, colour, motion | | Section 3 scale, section 4 tokens; reveals as in section 7, final states under reduced motion | Exact values |

## 10. Necessary differences (approved by the specification, recorded here)

1. **Identity.** Avyora wordmark and name; no Nuvē or Framer marks; the "Made in Framer" badge is absent.
2. **Photography.** Approved Avyora images in the same slots and ratios, until then clearly marked placeholders.
3. **Real products and prices.** Results cards show real catalogue items, SKU choice, current price and stock through the shared quote; no "$29/month" plan; no "98 %" statistic.
4. **Working commerce.** Bag, wishlist, account and Shop are reachable from the header or overlay. Checkout, routine finder, assistant and order tracking keep their current behaviour.
5. **Truthful content.** Feature rows describe what Avyora actually does (quiz-first, optional scan only when built, reviewed knowledge); no fabricated testimonials or expert endorsements; the FAQ covers shipping, returns, data and scan limits.
6. **Accessibility.** Reduced motion shows final states (the reference does not); visible focus; trapped focus in the menu; 4.5:1 contrast for text over photographs (verified overlay).
7. **Fonts.** Inter and Instrument Serif self-hosted from Google Fonts, not Framer's files.
8. **Mobile and tablet** layouts are out of scope until the owner finishes desktop testing.

## 11. Known limits of this package

- **Timings:** animation timings are proposed, not measured (Framer's runtime does not expose Web Animations). A screen recording at 60 fps is needed to tune them.
- **Hover:** hover was sampled on the hero CTA only. Card and link hovers are not captured.
- **Sticky header:** the trigger point of the light sticky header was not measured.
- **Scrollbars:** captures are without scrollbars; subtract 15 px of content width when comparing against a browser that shows one.
