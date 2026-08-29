'use client';

import { Product, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, ShieldCheck, Microscope, Leaf, Sparkles } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const HERO_SLIDES = [
  {
    title: 'Clinical science,\nquietly luxurious.',
    subtitle: 'Pure, effective, evidence-led formulations for your skin.',
    promo: '5% cashback on every order as Avyora Credit',
    image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=1920&q=80',
    hint: 'skincare bottles',
  },
  {
    title: 'The Avyora Circle',
    subtitle: 'Our membership for those who value science-first care.',
    promo: 'Earn and redeem credit on every purchase',
    image: 'https://images.unsplash.com/photo-1567721913486-6585f069b332?auto=format&fit=crop&w=1920&q=80',
    hint: 'skincare model',
  },
];

const VALUES = [
  { icon: ShieldCheck, title: 'Transparency', desc: 'Every active concentration disclosed in full.' },
  { icon: Microscope, title: 'Clinical efficacy', desc: 'In-house synthesis with batch-level quality control.' },
  { icon: Leaf, title: 'Considered sourcing', desc: 'Botanical actives from leading global laboratories.' },
  { icon: Sparkles, title: 'Fair pricing', desc: 'Premium dermal science without the retail markup.' },
];

export function HomeClient({
  products,
  categories,
  concerns,
  activeCategories,
  activeConcerns,
}: {
  products: Product[];
  categories: typeof CATEGORIES;
  concerns: typeof CONCERNS;
  activeCategories: ReadonlySet<string>;
  activeConcerns: ReadonlySet<string>;
}) {
  const [currentHero, setCurrentHero] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentHero((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="flex w-full flex-col bg-background transition-colors duration-300">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative h-[82vh] w-full overflow-hidden bg-muted" aria-label="Featured">
        {HERO_SLIDES.map((slide, i) => (
          <div
            key={i}
            className={cn(
              'absolute inset-0 transition-opacity duration-1000',
              currentHero === i ? 'z-10 opacity-100' : 'z-0 opacity-0'
            )}
          >
            <Image
              src={slide.image}
              alt=""
              aria-hidden="true"
              fill
              className={cn('object-cover', currentHero === i && 'animate-ken-burns')}
              priority={i === 0}
              sizes="100vw"
              data-ai-hint={slide.hint}
            />
            {/* Navy wash keeps the white type legible and ties the hero to the mark. */}
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(224_60%_10%_/_0.82)] via-[hsl(224_60%_10%_/_0.55)] to-transparent" />
            <div className="container absolute inset-0 mx-auto flex flex-col items-start justify-center px-4 text-white">
              {currentHero === i && (
                <div className="max-w-2xl animate-fade-up">
                  <span className="mb-6 inline-block text-[11px] font-semibold uppercase tracking-[0.32em] text-primary">
                    Avyora Skincare
                  </span>
                  <h1 className="mb-6 whitespace-pre-line font-headline text-4xl font-normal leading-[1.12] tracking-[0.01em] md:text-6xl">
                    {slide.title}
                  </h1>
                  <p className="mb-10 max-w-md text-base leading-relaxed text-white/80 md:text-lg">
                    {slide.subtitle}
                  </p>
                  <div className="mb-10 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-white/90">
                    <span className="h-px w-8 bg-primary" aria-hidden="true" />
                    {slide.promo}
                  </div>
                  <Link href="/collections">
                    <Button className="rounded-md bg-primary px-12 py-7 text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground transition-colors duration-300 hover:bg-white hover:text-foreground">
                      Shop the collection
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 gap-3">
          {HERO_SLIDES.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={currentHero === i}
              onClick={() => setCurrentHero(i)}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                currentHero === i ? 'w-12 bg-primary' : 'w-6 bg-white/45 hover:bg-white/70'
              )}
            />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ Products */}
      <section className="container mx-auto px-4 py-24" aria-labelledby="products-heading">
        <div className="mb-14 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <span className="eyebrow">Clinical formulations</span>
            <h2
              id="products-heading"
              className="mt-3 font-headline text-3xl font-normal tracking-[0.02em] md:text-4xl"
            >
              Our products
            </h2>
          </div>
          <Link
            href="/collections"
            className="group flex w-fit items-center gap-2 border-b border-primary/40 pb-1 text-xs font-semibold uppercase tracking-[0.2em] transition-colors hover:text-primary"
          >
            View full collection
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------- Bundle */}
      <section className="px-4 py-16" aria-labelledby="bundle-heading">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 overflow-hidden rounded-xl bg-[hsl(224_60%_13%)] text-white shadow-luxe-lg lg:grid-cols-2">
            <div className="flex flex-col justify-center space-y-8 p-12 md:p-16">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-primary">
                  Build your ritual
                </span>
                <h2
                  id="bundle-heading"
                  className="mt-4 font-headline text-3xl font-normal leading-snug tracking-[0.02em] md:text-4xl"
                >
                  Compose your own bundle
                </h2>
              </div>
              <ul className="space-y-4">
                {[
                  'An additional 15% off every bundle',
                  '5% back as Avyora Credit',
                  'Complimentary delivery, always',
                ].map((text) => (
                  <li key={text} className="flex items-center gap-4">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary"
                      aria-hidden="true"
                    >
                      <Sparkles className="h-3 w-3 text-primary-foreground" />
                    </span>
                    <span className="text-sm text-white/85">{text}</span>
                  </li>
                ))}
              </ul>
              <Link href="/routine-finder" className="w-fit">
                <Button className="rounded-md bg-primary px-12 py-7 text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground transition-colors hover:bg-white hover:text-foreground">
                  Start with the routine finder
                </Button>
              </Link>
            </div>
            <div className="relative aspect-square lg:aspect-auto">
              <Image
                src="https://images.unsplash.com/photo-1590439471364-192aa70c0b53?auto=format&fit=crop&w=1200&q=80"
                alt="An Avyora skincare bundle"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                data-ai-hint="skincare bundle"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Category */}
      <section className="overflow-hidden py-24" aria-labelledby="category-heading">
        <div className="container mx-auto mb-12 px-4 text-center">
          <span className="eyebrow">Explore</span>
          <h2
            id="category-heading"
            className="mt-3 font-headline text-3xl font-normal tracking-[0.02em] md:text-4xl"
          >
            Shop by category
          </h2>
          <span className="rule-gold mx-auto mt-8 max-w-xs" aria-hidden="true" />
        </div>
        <div className="no-scrollbar flex snap-x gap-6 overflow-x-auto px-4 pb-8 md:px-12">
          {categories.map((cat) => {
            const isComingSoon = !activeCategories.has(cat.id);
            const cardClass = cn(
              'group relative aspect-[3/4] w-[280px] shrink-0 snap-center overflow-hidden rounded-lg md:w-[340px]',
              isComingSoon && 'cursor-default'
            );
            const inner = (
              <>
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  className={cn(
                    'object-cover transition-transform [transition-duration:1200ms] ease-out',
                    isComingSoon ? 'opacity-60 grayscale' : 'group-hover:scale-105'
                  )}
                  sizes="(max-width: 768px) 280px, 340px"
                  data-ai-hint={cat.hint}
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-[hsl(224_60%_10%_/_0.85)] via-transparent to-transparent"
                  aria-hidden="true"
                />
                <div className="absolute inset-x-0 bottom-0 p-7">
                  <h3 className="font-headline text-2xl font-medium tracking-wide text-white">
                    {cat.name}
                  </h3>
                  {isComingSoon ? (
                    <Badge className="mt-3 rounded-full border-none bg-white/15 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white backdrop-blur-sm">
                      Coming soon
                    </Badge>
                  ) : (
                    <span className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                      Shop now
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  )}
                </div>
              </>
            );

            return isComingSoon ? (
              <div key={cat.id} className={cardClass}>
                {inner}
              </div>
            ) : (
              <Link key={cat.id} href={`/collections?category=${cat.id}`} className={cardClass}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------- Concerns */}
      <section className="bg-muted/40 py-24" aria-labelledby="concerns-heading">
        <div className="container mx-auto px-4">
          <div className="mb-14 text-center">
            <span className="eyebrow">Targeted results</span>
            <h2
              id="concerns-heading"
              className="mt-3 font-headline text-3xl font-normal tracking-[0.02em] md:text-4xl"
            >
              Shop by concern
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-8">
            {concerns.map((concern) => {
              const isComingSoon = !activeConcerns.has(concern.id);
              const inner = (
                <>
                  <div
                    className={cn(
                      'relative mb-4 aspect-square overflow-hidden rounded-full ring-1 ring-border transition-all duration-500',
                      isComingSoon ? 'opacity-45' : 'group-hover:ring-2 group-hover:ring-primary'
                    )}
                  >
                    <Image
                      src={concern.image}
                      alt={concern.name}
                      fill
                      className={cn(
                        'object-cover transition-transform duration-700',
                        isComingSoon ? 'grayscale' : 'group-hover:scale-110'
                      )}
                      sizes="(max-width: 768px) 45vw, 12vw"
                      data-ai-hint={concern.hint}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-medium uppercase tracking-[0.16em] transition-colors',
                      isComingSoon ? 'text-muted-foreground' : 'group-hover:text-primary'
                    )}
                  >
                    {concern.name}
                  </span>
                  {isComingSoon && (
                    <span className="mt-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                      Soon
                    </span>
                  )}
                </>
              );

              return isComingSoon ? (
                <div key={concern.id} className="group flex cursor-default flex-col text-center">
                  {inner}
                </div>
              ) : (
                <Link
                  key={concern.id}
                  href={`/collections?concern=${concern.id}`}
                  className="group flex flex-col text-center"
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Values */}
      <section className="py-28" aria-labelledby="values-heading">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-20 max-w-2xl text-center">
            <h2
              id="values-heading"
              className="font-headline text-3xl font-normal leading-snug tracking-[0.02em] md:text-4xl"
            >
              The clinical future of personal care
            </h2>
            <span className="rule-gold mx-auto mt-8 max-w-xs" aria-hidden="true" />
            <p className="mt-8 text-base leading-relaxed text-muted-foreground">
              Full disclosure of every clinical ingredient and its exact concentration.
              All Avyora products are formulated in-house for maximum efficacy.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((val) => (
              <div key={val.title} className="group flex flex-col items-center text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-primary/35 text-primary transition-colors duration-500 group-hover:bg-primary group-hover:text-primary-foreground">
                  <val.icon className="h-6 w-6" />
                </div>
                <h3 className="font-headline text-xl font-medium tracking-wide">{val.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{val.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
