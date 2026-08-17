'use client';

import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, ShieldCheck, Microscope, Zap, Droplet } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const HERO_SLIDES = [
  {
    title: "Clinical Science.",
    subtitle: "Pure, effective, and science-backed formulations for your unique skin needs.",
    promo: "5% Cashback on all orders as Avyora Credit.",
    image: "https://picsum.photos/seed/hero1/1920/1080",
    hint: "skincare bottles"
  },
  {
    title: "The Avyora Circle",
    subtitle: "Our exclusive loyalty program for those who value science-first care.",
    promo: "Earn & redeem credit on every purchase.",
    image: "https://picsum.photos/seed/hero2/1920/1080",
    hint: "skincare model"
  }
];

export default function Home() {
  const [currentHero, setCurrentHero] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentHero(prev => (prev + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const activeCategories = new Set(PRODUCTS.map(p => p.category));
  const activeConcerns = new Set(PRODUCTS.flatMap(p => p.concerns));

  return (
    <main className="flex flex-col w-full bg-background transition-colors duration-300">
      {/* Hero Section */}
      <section className="relative h-[85vh] w-full overflow-hidden bg-muted" aria-label="Hero Carousel">
        {HERO_SLIDES.map((slide, i) => (
          <div 
            key={i}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000",
              currentHero === i ? "opacity-100 z-10" : "opacity-0 z-0"
            )}
          >
            <Image 
              src={slide.image} 
              alt={slide.title} 
              fill 
              className="object-cover grayscale"
              priority
              data-ai-hint={slide.hint}
            />
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-0 container mx-auto px-4 flex flex-col justify-center items-start text-white">
              <div className="max-w-2xl animate-in fade-in slide-in-from-left-8 duration-700">
                <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-6 uppercase leading-[0.9]">{slide.title}</h1>
                <p className="text-sm md:text-lg font-bold uppercase tracking-[0.3em] mb-8 opacity-90">{slide.subtitle}</p>
                <div className="bg-primary text-white px-6 py-3 text-[10px] font-black uppercase tracking-widest w-fit mb-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]">
                  {slide.promo}
                </div>
                <Link href="/collections">
                  <Button className="bg-white text-black hover:bg-primary hover:text-white px-16 py-10 text-xs font-black uppercase tracking-widest rounded-none transition-all duration-300 border-none">
                    Shop Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex gap-6">
          {HERO_SLIDES.map((_, i) => (
            <button 
              key={i} 
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setCurrentHero(i)}
              className={cn(
                "w-3 h-3 rounded-full transition-all border-2 border-white",
                currentHero === i ? "bg-white w-12" : "bg-transparent"
              )}
            />
          ))}
        </div>
      </section>

      {/* Our Products Section */}
      <section className="py-32 container mx-auto px-4" aria-labelledby="products-heading">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
          <div className="space-y-4">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Clinical Formulations</span>
            <h2 id="products-heading" className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">Our Products</h2>
            <div className="w-32 h-2 bg-primary mt-6" aria-hidden="true" />
          </div>
          <Link href="/collections" className="text-[10px] font-black uppercase tracking-widest hover:text-primary flex items-center gap-3 border-b-4 border-transparent hover:border-primary pb-2 transition-all duration-300 w-fit">
            View Full Collection <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-8 gap-y-16">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Bundle Promo */}
      <section className="bg-muted/20 py-32 transition-colors" aria-labelledby="bundle-heading">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-4 border-foreground bg-card overflow-hidden shadow-[30px_30px_0px_0px_rgba(0,0,0,0.05)] transition-shadow">
            <div className="p-16 md:p-24 flex flex-col justify-center space-y-12">
              <h2 id="bundle-heading" className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85]">Synthesize Your Bundle</h2>
              <div className="space-y-6">
                {[
                  "Additional 15% Clinical Discount on bundles",
                  "5% Dermal Credit on all syntheses",
                  "Complimentary delivery on all bundles"
                ].map(text => (
                  <div key={text} className="flex items-center gap-5">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shrink-0" aria-hidden="true">
                      <Zap className="h-4 w-4 text-white fill-white" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">{text}</span>
                  </div>
                ))}
              </div>
              <Button className="bg-foreground text-background px-16 py-10 text-[10px] font-black uppercase tracking-widest rounded-none hover:bg-primary transition-all duration-300 w-fit border-none">
                Start Synthesis
              </Button>
            </div>
            <div className="relative aspect-square lg:aspect-auto">
              <Image 
                src="https://picsum.photos/seed/bundle-kit/1000/1000" 
                alt="Avyora Skincare Bundle Kit" 
                fill 
                className="object-cover grayscale"
                data-ai-hint="skincare bundle"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Shop by Category Carousel */}
      <section className="py-32 overflow-hidden bg-foreground text-background" aria-labelledby="category-heading">
        <div className="container mx-auto px-4 mb-20 text-center">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Science Categories</span>
          <h2 id="category-heading" className="text-4xl md:text-7xl font-black tracking-tighter uppercase mt-4">Shop by Category</h2>
        </div>
        <div className="flex gap-12 overflow-x-auto pb-16 snap-x px-8 md:px-32 no-scrollbar">
          {CATEGORIES.map((cat) => {
            const isComingSoon = !activeCategories.has(cat.id);
            return (
              <div 
                key={cat.id} 
                className={cn(
                  "relative min-w-[320px] md:min-w-[450px] aspect-[3/4] group snap-center overflow-hidden border-2 border-transparent hover:border-primary transition-all duration-700",
                  isComingSoon && "opacity-70"
                )}
              >
                <Image 
                  src={cat.image} 
                  alt={cat.name} 
                  fill 
                  className={cn(
                    "object-cover transition-all duration-1000 group-hover:scale-110",
                    isComingSoon ? "grayscale" : "grayscale group-hover:grayscale-0"
                  )}
                  data-ai-hint={cat.hint}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden="true" />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                  <span className="text-white text-4xl md:text-5xl font-black uppercase tracking-[0.3em] group-hover:scale-105 transition-transform text-center leading-tight">
                    {cat.name}
                  </span>
                  {isComingSoon ? (
                    <Badge className="mt-6 bg-primary text-white border-none rounded-none px-6 py-2 text-[10px] font-black uppercase tracking-widest">Coming Soon</Badge>
                  ) : (
                    <Link href={`/collections?category=${cat.id}`} className="mt-8 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                      <Button className="bg-white text-black hover:bg-primary hover:text-white text-[9px] font-black uppercase tracking-widest px-8 rounded-none border-none">Shop Category</Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Shop by Concerns Carousel */}
      <section className="py-32 container mx-auto px-4" aria-labelledby="concerns-heading">
        <div className="text-center mb-24 space-y-4">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Targeted Results</span>
          <h2 id="concerns-heading" className="text-4xl md:text-7xl font-black tracking-tighter uppercase">Shop by Concern</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-10">
          {CONCERNS.map((concern) => {
            const isComingSoon = !activeConcerns.has(concern.id);
            return (
              <div key={concern.id} className="flex flex-col group relative">
                <div className={cn(
                  "relative aspect-square overflow-hidden mb-8 border-2 border-foreground/10 transition-all duration-500",
                  isComingSoon ? "opacity-40" : "group-hover:border-primary group-hover:shadow-[10px_10px_0px_0px_rgba(249,115,22,0.1)]"
                )}>
                  <Image 
                    src={concern.image} 
                    alt={concern.name} 
                    fill 
                    className={cn(
                      "object-cover grayscale transition-all duration-700",
                      !isComingSoon && "group-hover:grayscale-0 group-hover:scale-110"
                    )}
                    data-ai-hint={concern.hint}
                  />
                  {isComingSoon && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Badge className="bg-foreground/80 text-background border-none rounded-none text-[8px] font-black uppercase px-2 py-1 tracking-widest">Soon</Badge>
                    </div>
                  )}
                </div>
                <div className="text-center space-y-2">
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-[0.3em] transition-colors",
                    isComingSoon ? "text-muted-foreground" : "group-hover:text-primary"
                  )}>
                    {concern.name}
                  </span>
                  {!isComingSoon && (
                    <Link href={`/collections?concern=${concern.id}`} className="block">
                      <Button variant="link" className="text-[7px] font-black uppercase tracking-[0.4em] h-auto p-0 opacity-40 group-hover:opacity-100 transition-opacity">View Products</Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Brand Values */}
      <section className="py-40 bg-card transition-colors" aria-labelledby="values-heading">
        <div className="container mx-auto px-4 text-center mb-32 space-y-6">
          <h2 id="values-heading" className="text-4xl md:text-7xl font-black tracking-tighter uppercase">Clinical Future of Personal Care</h2>
          <div className="w-24 h-2 bg-primary mx-auto" aria-hidden="true" />
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground max-w-2xl mx-auto leading-relaxed mt-10">
            Full disclosure of clinical ingredients & their exact syntheses. All Avyora products are manufactured in-house for maximum efficacy.
          </p>
        </div>
        <div className="container mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-20">
          {[
            { icon: ShieldCheck, title: 'Transparency', desc: '100% Disclosure of active ingredient concentrations.' },
            { icon: Microscope, title: 'Clinical Efficacy', desc: 'In-house synthesis ensures batch-level quality control.' },
            { icon: Droplet, title: 'Accessibility', desc: 'Premium dermal science, accessible without retail markups.' },
            { icon: Zap, title: 'Global Sourcing', desc: 'Purest raw ingredients from leading global bio-laboratories.' },
          ].map((val) => (
            <div key={val.title} className="flex flex-col items-center text-center group">
              <div className="w-24 h-24 border-4 border-foreground mb-10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary group-hover:text-white transition-all duration-500 shadow-[10px_10px_0px_0px_rgba(0,0,0,0.1)] group-hover:shadow-none translate-y-0 group-hover:-translate-y-2">
                <val.icon className="h-10 w-10" />
              </div>
              <h4 className="text-[11px] font-black uppercase tracking-[0.4em] mb-6 transition-colors">{val.title}</h4>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground leading-loose px-4">
                {val.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
