import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Check, ClipboardList, FlaskConical, MessageCircleQuestion, Star, Wallet, Bookmark } from 'lucide-react';
import { Accordion } from '@/components/nv/accordion';
import { DELIVERY_SHORT, DELIVERY_TERMS, formatPaise } from '@/lib/money';
import { SUPPORT_EMAIL } from '@/data/business-info';
import { GUEST_RETENTION_DAYS, ACCOUNT_RETENTION_DAYS } from '@/modules/personal/personal-records';
import { QuickAdd } from './quick-add';
import { SupportForm } from './support-form';
import type { EssentialStep, LandingProduct, LandingReview } from './data';

/**
 * The redesign landing page below the hero, in the reference's section
 * order: About, Results, Vision, Features, Services, Testimonials, Pricing,
 * Image, FAQ, Consultation (the footer is the shell's). Geometry follows
 * the measured reference (docs/redesign-reference/nuve-reference-2026-10-08.md):
 * 1240 px column (40 px gutters at 1280), 80/88 section headings, radius-18
 * cards with 8 px gaps. Server components except the add-to-bag control,
 * the FAQ accordion and the support form.
 *
 * Content is Avyora's own and true today: no statistics, testimonials or
 * services that do not exist. Where approved photography is missing, the
 * slot is a neutral surface (see PHOTO_SLOTS) rather than stock imagery.
 */

const COLUMN = 'mx-auto w-full max-w-[calc(var(--nv-container)+2*var(--nv-gutter))] px-nv-gutter';

/**
 * Photography slots with no approved image yet. Each keeps its measured
 * size; supply an approved photograph and set `src`.
 */
// Placeholder imagery until approved campaign photography exists: AI-generated still lifes
// (Gamma) in /public/images/home, plus two Unsplash-License photos. No labels, logos or people.
// `scrim` darkens the photo where white text sits on it, keeping it at 4.5:1; `imgClass`
// adjusts framing (focal point, mirroring) when one image serves two slots.
// `wide` crops an Unsplash original to a 16:9 frame for the full-bleed sections.
const unsplash = (id: string, wide = false) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2400&q=80${wide ? '&h=1350&crop=edges' : ''}`;
const PHOTO_SLOTS: Record<'about' | 'aboutCard' | 'vision' | 'services' | 'testimonial' | 'imageBreak' | 'consultation', { src: string | null; alt: string; scrim?: string; imgClass?: string }> = {
  about: { src: '/images/home/about.jpg', alt: 'An amber dropper bottle on a travertine block beside a sprig of sage' },
  aboutCard: { src: '/images/home/about-card.jpg', alt: '', scrim: 'bg-[linear-gradient(to_top,rgba(0,0,0,0.6),transparent_60%)]' },
  vision: { src: '/images/home/vision.jpg', alt: '', scrim: 'bg-[linear-gradient(to_right,rgba(0,0,0,0.55),transparent_60%)]' },
  services: { src: unsplash('photo-1773924684918-176cb489e65f', true), alt: '', scrim: 'bg-black/55' },
  testimonial: { src: unsplash('photo-1789182226631-87e1e5bba655'), alt: 'Glass bottles of golden oil with dried rose petals' },
  imageBreak: { src: '/images/home/hero-mobile.jpg', alt: 'An amber dropper bottle and a cream jar on stacked stones in warm light', imgClass: 'object-[center_62%]' },
  consultation: { src: '/images/home/hero.jpg', alt: '', scrim: 'bg-[linear-gradient(to_right,rgba(0,0,0,0.8),rgba(0,0,0,0.45)_55%,rgba(0,0,0,0.25))]' },
};

function Photo({ slot, className, sizes, children }: { slot: keyof typeof PHOTO_SLOTS; className?: string; sizes: string; children?: React.ReactNode }) {
  const p = PHOTO_SLOTS[slot];
  return (
    <div className={`relative overflow-hidden bg-[radial-gradient(ellipse_at_60%_35%,#4a4642,#1a1a1a_75%)] ${className ?? ''}`}>
      {p.src && <Image src={p.src} alt={p.alt} fill sizes={sizes} className={`object-cover ${p.imgClass ?? 'object-center'}`} />}
      {p.src && p.scrim && <div aria-hidden="true" className={`absolute inset-0 ${p.scrim}`} />}
      {children}
    </div>
  );
}

const Heading = ({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) => (
  <h2 id={id} className={`text-nv-display font-medium ${className ?? ''}`}>
    {children}
  </h2>
);

/* ----------------------------------------------------------- About Us -- */

export function About() {
  return (
    <section aria-labelledby="about-heading" className="nv-reveal bg-nv-page pb-16 pt-20 lg:pb-[100px] lg:pt-[150px]">
      <div className={`${COLUMN} grid gap-8 lg:grid-cols-[392px_1fr] lg:gap-x-[64px] lg:gap-y-0`}>
        <Photo slot="about" sizes="392px" className="h-[420px] rounded-nv-card lg:h-[512px]" />
        <div className="flex flex-col justify-between gap-8 lg:h-[512px] lg:gap-0">
          <h2 id="about-heading" className="text-nv-lead lg:indent-[70px] font-medium">
            Avyora builds a routine around your skin, <span className="text-nv-muted">your budget and the products you already own.</span> Start with cleanse,
            moisturise and protect, and add a treatment only when its directions have been reviewed.
          </h2>
          <div className="grid gap-nv-gap sm:grid-cols-2 lg:h-[347px]">
            <div className="flex flex-col rounded-nv-card bg-nv-card p-6">
              <p className="text-nv-label">Your week, planned</p>
              <p className="mt-auto text-nv-figure font-medium">
                7<span className="ml-1 align-top text-nv-intro">days</span>
              </p>
              <p className="mt-3 text-nv-body text-nv-muted">Morning and evening steps for every day, in order.</p>
              <Link href="/routine-finder" className="nv-focus mt-6 inline-flex h-[49px] items-center justify-center rounded-nv-pill bg-nv-ink text-nv-label text-white hover:bg-nv-accent">
                Find your routine
              </Link>
            </div>
            <Photo slot="aboutCard" sizes="388px" className="flex min-h-[260px] flex-col justify-end rounded-nv-card p-6 text-white">
              <div className="relative">
                <p className="text-nv-contact font-medium">Reviewed before it is shown</p>
                <p className="mt-2 text-nv-label text-white/85">Directions and ingredient cautions appear only after review.</p>
              </div>
            </Photo>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Results -- */

export function Results({ products }: { products: LandingProduct[] }) {
  return (
    <section aria-labelledby="results-heading" className="bg-nv-page pb-24 pt-16 lg:pb-[200px] lg:pt-[100px]">
      <div className={COLUMN}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-12">
          <Heading id="results-heading">Best sellers</Heading>
          <p className="max-w-[305px] sm:text-right text-nv-body text-nv-muted">Current prices and stock, straight from the shop.</p>
        </div>
        {products.length === 0 ? (
          <p className="mt-16 text-nv-body text-nv-muted">
            Products are unavailable right now. <Link href="/collections" className="nv-focus underline">Browse the shop</Link>.
          </p>
        ) : (
          <ul className="mt-[42px] grid gap-nv-gap sm:grid-cols-2">
            {products.map((p) => (
              <li key={p.id} className="nv-reveal relative aspect-[616/585] overflow-hidden rounded-nv-card bg-nv-line">
                <Image src={p.image} alt="" fill sizes="(min-width: 1320px) 616px, 50vw" className="object-cover object-center" />
                <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.55),transparent_50%),linear-gradient(to_bottom,rgba(0,0,0,0.25),transparent_30%)]" />
                <div className="absolute left-5 top-5 flex flex-wrap gap-2 lg:left-8 lg:top-8">
                  {p.concerns.map((c) => (
                    <span key={c} className="rounded-nv-pill bg-nv-glass px-4 py-2 text-nv-label capitalize text-white backdrop-blur-sm">
                      {c.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
                <div className="absolute inset-x-5 bottom-5 flex lg:inset-x-8 lg:bottom-8 items-end justify-between gap-6">
                  <div className="space-y-4">
                    <h3 className="text-nv-title font-medium text-white">
                      <Link href={`/products/${p.slug}`} className="nv-focus-light after:absolute after:inset-0">
                        {p.name}
                      </Link>
                    </h3>
                    <div className="relative z-10">
                      <QuickAdd productId={p.id} productName={p.name} skus={p.skus} />
                    </div>
                  </div>
                  <span aria-hidden="true" className="relative z-10 flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-white text-nv-ink">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Vision -- */

export function Vision() {
  return (
    <section aria-labelledby="vision-heading">
      <Photo slot="vision" sizes="100vw" className="min-h-[560px] lg:h-screen lg:min-h-[640px]">
        <div className={`${COLUMN} relative pt-24 lg:pt-[145px]`}>
          <h2 id="vision-heading" className="max-w-[600px] lg:ml-6 text-nv-statement font-medium text-white">
            “Fewer steps you can keep, <span className="text-nv-faint">chosen for your skin and your budget,</span> beat a shelf of products you never finish.”
          </h2>
        </div>
      </Photo>
    </section>
  );
}

/* ----------------------------------------------------------- Features -- */

const FEATURES = [
  { icon: ClipboardList, title: 'Short questionnaire', text: 'Skin type, sensitivity, budget and what you already use.' },
  { icon: CalendarDays, title: 'A real weekly routine', text: 'Every morning and evening, in order, for all seven days.' },
  { icon: FlaskConical, title: 'Ingredient checks', text: 'Known allergens and conflicts are checked before anything is suggested.' },
  { icon: Wallet, title: 'Your budget, your shelf', text: 'Uses what you own first and keeps new purchases within your budget.' },
  { icon: MessageCircleQuestion, title: 'Ask Avyora', text: 'Answers from reviewed information, with sources.' },
  { icon: Bookmark, title: 'Saved routines', text: `Kept ${ACCOUNT_RETENTION_DAYS} days with an account, ${GUEST_RETENTION_DAYS} without; delete any time.` },
];

export function Features() {
  return (
    <section aria-labelledby="features-heading" className="bg-nv-page py-24 lg:py-[200px]">
      <div className={COLUMN}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Heading id="features-heading">How it works</Heading>
          <Link href="/routine-finder" className="nv-focus inline-flex h-[49px] items-center rounded-nv-pill bg-nv-ink px-6 text-nv-label text-white hover:bg-nv-accent">
            Find your routine
          </Link>
        </div>
        <ol className="mt-[42px] grid gap-nv-gap sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li key={f.title} className="nv-reveal rounded-nv-card bg-nv-card p-8 lg:h-[194px]">
              <div className="flex items-center justify-between">
                <f.icon className="h-6 w-6" aria-hidden="true" />
                <span className="text-nv-label text-nv-muted">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="ml-[22px] mt-6 text-nv-contact font-medium">{f.title}</h3>
              <p className="ml-[22px] mt-2 max-w-[260px] text-nv-label text-nv-muted">{f.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- Services -- */

export function Services() {
  return (
    <section aria-labelledby="services-heading">
      <Photo slot="services" sizes="100vw" className="lg:h-[986px]">
        <div className={`${COLUMN} relative py-20 lg:py-[150px]`}>
          <h2 id="services-heading" className="max-w-[600px] lg:ml-6 text-nv-statement font-medium text-white">
            Shop the range, <span className="text-nv-faint">build a routine from it, look up an ingredient or read the journal.</span>
          </h2>
          {/* The reference's service rows: label, short description, divider and arrow, each a real route. */}
          <ul className="mt-12 max-w-[1192px] lg:ml-6 lg:mt-16 border-t border-white/20">
            {[
              ['Shop all products', 'Every product, with current prices and stock.', '/collections'],
              ['Routine finder', 'A weekly morning and evening routine from a short questionnaire.', '/routine-finder'],
              ['Ask Avyora', 'Ingredient and product questions, answered from reviewed information.', '/assistant'],
              ['Journal', 'Articles on routines and ingredients.', '/journal'],
            ].map(([label, text, href]) => (
              <li key={href} className="border-b border-white/20">
                <Link href={href} className="nv-focus-light group flex items-center justify-between gap-8 py-6 text-white">
                  <span>
                    <span className="block text-nv-contact font-medium">{label}</span>
                    <span className="mt-1 block text-nv-label text-white/70">{text}</span>
                  </span>
                  <ArrowUpRight className="nv-motion h-5 w-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Photo>
    </section>
  );
}

/* ------------------------------------------------------- Testimonials -- */

export function Testimonials({ review }: { review: LandingReview | null }) {
  return (
    <section aria-labelledby="testimonials-heading" className="bg-nv-page pb-16 pt-24 lg:pb-[100px] lg:pt-[200px]">
      <div className={COLUMN}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Heading id="testimonials-heading">{review ? 'From customers' : 'Simple skincare'}</Heading>
          <p className="max-w-[300px] sm:text-right text-nv-body text-nv-muted">Understand your skin and build a routine you can keep.</p>
        </div>
        <div className="mt-[42px] grid gap-nv-gap lg:h-[515px] lg:grid-cols-[304px_1fr_304px]">
          <div className="flex flex-col rounded-nv-card bg-nv-card p-8">
            <p className="font-wordmark text-nv-wordmark">Avyora</p>
            <h3 className="mt-auto text-nv-title font-medium">
              Built around
              <br />
              your skin
            </h3>
            <p className="mt-3 text-nv-body text-nv-muted">Answers about your skin and habits decide what goes in your routine, and what stays out.</p>
            <Link href="/routine-finder" className="nv-focus mt-6 inline-flex h-[49px] items-center justify-center rounded-nv-pill bg-nv-ink text-nv-label text-white hover:bg-nv-accent">
              Find your routine
            </Link>
          </div>
          <Photo slot="testimonial" sizes="(min-width: 1024px) 616px, 100vw" className="aspect-[4/3] rounded-nv-card lg:aspect-auto" />
          <div className="flex flex-col rounded-nv-card bg-nv-card p-8">
            {review ? (
              <>
                <p className="flex gap-1" aria-label={`Rated ${review.rating} out of 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={`h-4 w-4 ${i < review.rating ? 'fill-nv-ink' : 'text-nv-line'}`} aria-hidden="true" />
                  ))}
                </p>
                {/* The card has a fixed measured height: long reviews are clamped, with the full text on the product page. */}
                <blockquote className="mt-6 line-clamp-[8] text-nv-quote font-medium">“{review.body}”</blockquote>
                {review.productSlug && (
                  <Link href={`/products/${review.productSlug}#reviews-heading`} className="nv-focus mt-3 text-nv-small underline underline-offset-4">
                    Read the full review
                  </Link>
                )}
                <p className="mt-auto text-nv-label">{review.productName}</p>
                <p className="text-nv-small text-nv-muted">{review.verified ? 'Verified purchase' : 'Customer review'}</p>
              </>
            ) : (
              <>
                {/* No published reviews yet: product education, labelled as such, instead of a testimonial. */}
                <p className="text-nv-small uppercase text-nv-muted">How routines work</p>
                <p className="mt-6 text-nv-quote font-medium">Essentials every day. A treatment only when its directions have been reviewed, and never while your skin is irritated.</p>
                <p className="mt-auto text-nv-small text-nv-muted">Reviews will appear here once customers publish them.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Pricing -- */

const STEPS = [
  { title: 'Answer', text: 'A short questionnaire about your skin, budget and current products.' },
  { title: 'Get your week', text: 'A morning and evening routine for all seven days.' },
  { title: 'Adjust', text: 'Change your budget or swap a product; the whole week is rechecked.' },
];

export function Pricing({ steps }: { steps: EssentialStep[] }) {
  const priced = steps.filter((s) => s.from);
  const total = priced.reduce((n, s) => n + s.from!.sku.pricePaise, 0);
  return (
    <section aria-labelledby="pricing-heading" className="bg-nv-page pb-24 pt-16 lg:pb-[200px] lg:pt-[100px]">
      <div className={COLUMN}>
        <h2 id="pricing-heading" className="max-w-[600px] text-nv-title font-medium">
          See how Avyora builds your routine <span className="text-nv-muted">and what the essentials cost</span> today
        </h2>
        <div className="mt-[42px] grid gap-nv-gap lg:grid-cols-[408px_1fr]">
          <ol className="flex flex-col gap-nv-gap">
            {STEPS.map((s, i) => (
              <li key={s.title} className="nv-reveal rounded-nv-card bg-nv-card p-8 lg:h-[192px]">
                <div className="flex items-center justify-between">
                  <span className="text-nv-label text-nv-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span aria-hidden="true" className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className={`h-2 w-2 rounded-full ${d <= i ? 'bg-nv-ink' : 'bg-nv-line'}`} />
                    ))}
                  </span>
                </div>
                <h3 className="mt-6 text-nv-contact font-medium">{s.title}</h3>
                <p className="mt-2 max-w-[260px] text-nv-label text-nv-muted">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="rounded-nv-card bg-nv-card p-3">
            <div className="flex min-h-[401px] flex-col rounded-nv-inner bg-nv-page p-6">
              <h3 className="text-nv-title font-medium">The three essentials</h3>
              <p className="mt-2 max-w-[360px] text-nv-label text-nv-muted">
                Every routine starts with these. Prices are the lowest current price in stock for each step; your routine finder result may choose differently.
              </p>
              <ul className="mt-6 space-y-3">
                {steps.map((s) => (
                  <li key={s.role} className="flex items-center justify-between gap-6 border-b border-nv-line pb-3">
                    <span className="text-nv-label">
                      <span className="text-nv-muted">{s.label} · </span>
                      {s.from ? (
                        <Link href={`/products/${s.from.product.slug}`} className="nv-focus hover:underline">
                          {s.from.product.name}, {s.from.sku.size}
                        </Link>
                      ) : (
                        'Currently unavailable'
                      )}
                    </span>
                    <span className="text-nv-label">{s.from ? `from ${formatPaise(s.from.sku.pricePaise)}` : '—'}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap items-end justify-between gap-6 pt-8">
                <p>
                  <span className="text-nv-label text-nv-muted">Essentials from </span>
                  <span className="text-nv-figure font-medium">{priced.length === 3 ? formatPaise(total) : '—'}</span>
                </p>
                <Link href="/routine-finder" className="nv-focus inline-flex h-[49px] items-center rounded-nv-pill bg-nv-ink px-6 text-nv-label text-white hover:bg-nv-accent">
                  Build my routine
                </Link>
              </div>
            </div>
            <ul className="grid gap-x-8 gap-y-3 px-6 sm:grid-cols-2 py-6 text-nv-label text-nv-muted">
              {['Allergy and conflict checks', 'Uses products you own', 'Stays within your budget', 'Saved with your permission', DELIVERY_SHORT, 'Prices confirmed at checkout'].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-nv-ink" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- Image break -- */

export function ImageBreak() {
  return (
    <div className="relative h-screen min-h-[640px]" aria-hidden="true">
      <Photo slot="imageBreak" sizes="100vw" className="sticky top-0 h-screen min-h-[640px]" />
    </div>
  );
}

/* ---------------------------------------------------------------- FAQ -- */

const FAQ_ITEMS = [
  {
    id: 'routine',
    question: 'How is my routine built?',
    answer: 'From your answers: skin type, sensitivity, budget and the products you already use. Every routine starts with cleanse, moisturise and protect. A treatment is added only when its directions have been reviewed and nothing in your answers rules it out.',
  },
  {
    id: 'scan',
    question: 'Do I need a face scan?',
    answer: 'No. The questionnaire builds a complete routine on its own. A face scan is not available yet.',
  },
  {
    id: 'saving',
    question: 'What happens to my answers?',
    answer: `Nothing is saved unless you choose to save a routine. Saved routines are kept for ${GUEST_RETENTION_DAYS} days without an account and ${ACCOUNT_RETENTION_DAYS} days with one, and you can delete them at any time.`,
  },
  {
    id: 'delivery',
    question: 'How much is delivery?',
    answer: DELIVERY_TERMS,
  },
  {
    id: 'returns',
    question: 'Can I return a product?',
    answer: (
      <>
        The refund and cancellation policy sets out what can be returned and how.{' '}
        <Link href="/refund-policy" className="nv-focus underline">
          Read the refund policy
        </Link>
        .
      </>
    ),
  },
  {
    id: 'medical',
    question: 'Is this medical advice?',
    answer: 'No. Avyora gives general skincare guidance. For a persistent, painful or spreading skin problem, please see a dermatologist.',
  },
];

export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="bg-nv-page py-24 lg:py-[200px]">
      <div className={`${COLUMN} grid gap-12 lg:grid-cols-[1fr_800px]`}>
        <div className="flex flex-col">
          <Heading id="faq-heading">FAQ</Heading>
          <p className="mt-6 max-w-[260px] text-nv-body text-nv-muted">Questions people ask before they start.</p>
          <Link href="/assistant" className="nv-focus mt-6 inline-flex items-center gap-2 text-nv-intro lg:mt-auto">
            Ask a question <span aria-hidden="true">→</span>
          </Link>
        </div>
        <Accordion items={FAQ_ITEMS} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------- Consultation -- */

export function Consultation() {
  return (
    <section aria-labelledby="consultation-heading">
      <Photo slot="consultation" sizes="100vw" className="lg:min-h-[993px]">
        <div className={`${COLUMN} relative py-20 lg:py-[150px]`}>
          <div className="max-w-[600px] lg:ml-6">
            <h2 id="consultation-heading" className="text-nv-statement font-medium text-white">
              Questions about your skin <span className="text-nv-faint">or an order?</span> Send us a message.
            </h2>
            <p className="mt-6 text-nv-body text-white/70">
              A member of the team replies by email. You can also write to {SUPPORT_EMAIL}.
            </p>
            <div className="mt-12">
              <SupportForm />
            </div>
          </div>
        </div>
      </Photo>
    </section>
  );
}
