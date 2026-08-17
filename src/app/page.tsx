'use client';

import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShieldCheck, Microscope, Zap, Droplet } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const HERO_SLIDES = [
  {
    title: "Science-Backed Care.",
    subtitle: "Pure, effective, and clinical formulations for your unique skin needs.",
    promo: "Enjoy 5% Cashback on all orders.",
    image: "https://picsum.photos/seed/hero1/1920/1080",
    hint: "skincare bottles"
  },
  {
    title: "Welcome to TrustCircle",
    subtitle: "Our exclusive loyalty program for those who value science.",
    promo: "Earn & redeem Mcash on every purchase.",
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

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative h-[85vh] w-full overflow-hidden bg-muted">
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
              className="object-cover"
              priority
              data-ai-hint={slide.hint}
            />
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-0 container mx-auto px-4 flex flex-col justify-center items-start text-white">
              <div className="max-w-2xl animate-in fade-in slide-in-from-left-8 duration-700">
                <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-6 uppercase">{slide.title}</h1>
                <p className="text-sm md:text-lg font-bold uppercase tracking-[0.3em] mb-4 opacity-90">{slide.subtitle}</p>
                <div className="bg-primary/90 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest w-fit mb-8">
                  {slide.promo}
                </div>
                <Link href="/collections">
                  <Button className="bg-white text-black hover:bg-white/90 px-12 py-8 text-xs font-black uppercase tracking-widest rounded-none">
                    Shop Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-4">
          {HERO_SLIDES.map((_, i) => (
            <button 
              key={i} 
              onClick={() => setCurrentHero(i)}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                currentHero === i ? "bg-white w-8" : "bg-white/40"
              )}
            />
          ))}
        </div>
      </section>

      {/* Our Products Section (Merged) */}
      <section className="py-24 container mx-auto px-4">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter uppercase">Our Products</h2>
            <div className="w-20 h-1.5 bg-primary mt-4" />
          </div>
          <Link href="/collections" className="text-[10px] font-black uppercase tracking-widest hover:text-primary flex items-center gap-2 border-b-2 border-transparent hover:border-primary pb-1 transition-all">
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-16">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Bundle Promo */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-2 border-foreground bg-white overflow-hidden shadow-[20px_20px_0px_0px_rgba(0,0,0,0.1)]">
            <div className="p-12 md:p-20 flex flex-col justify-center space-y-8">
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">Build Your Own Bundle!</h2>
              <div className="space-y-4">
                {[
                  "Get Additional Discount UPTO 15% on custom kit",
                  "+5% Cashback as Mcash on all orders",
                  "Free delivery on all bundles"
                ].map(text => (
                  <div key={text} className="flex items-center gap-4">
                    <Zap className="h-5 w-5 text-primary fill-primary" />
                    <span className="text-xs font-black uppercase tracking-widest">{text}</span>
                  </div>
                ))}
              </div>
              <Button className="bg-foreground text-background px-12 py-8 text-xs font-black uppercase tracking-widest rounded-none hover:bg-primary transition-colors">
                Shop The Bundle
              </Button>
            </div>
            <div className="relative aspect-square lg:aspect-auto">
              <Image 
                src="https://picsum.photos/seed/bundle-kit/1000/1000" 
                alt="Bundle Kit" 
                fill 
                className="object-cover"
                data-ai-hint="skincare bundle"
              />
            </div>
          </div>
        </div>
      </section>

      {/* SkinInsights Section */}
      <section className="py-24 container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="relative aspect-[4/5] bg-muted overflow-hidden">
            <Image 
              src="https://picsum.photos/seed/insight-model/800/1000" 
              alt="Skin Scan" 
              fill 
              className="object-cover"
              data-ai-hint="skincare model close-up"
            />
            {/* Annotated callouts simulation */}
            <div className="absolute top-[30%] left-[40%] group">
              <div className="w-3 h-3 bg-primary rounded-full animate-ping absolute" />
              <div className="w-3 h-3 bg-primary rounded-full relative" />
              <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur px-3 py-1 text-[8px] font-black uppercase tracking-widest border border-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                Acne Detection
              </div>
            </div>
            <div className="absolute top-[50%] left-[60%] group">
              <div className="w-3 h-3 bg-primary rounded-full animate-ping absolute" />
              <div className="w-3 h-3 bg-primary rounded-full relative" />
              <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur px-3 py-1 text-[8px] font-black uppercase tracking-widest border border-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                Pigmentation
              </div>
            </div>
          </div>
          <div className="space-y-8">
            <h2 className="text-4xl md:text-7xl font-black tracking-tighter uppercase leading-none">SkinInsights — Know Your Skin Health, Using AI</h2>
            <p className="text-sm font-bold uppercase tracking-widest leading-relaxed text-muted-foreground">
              Our advanced AI analyzes your skin health through a single selfie, detecting concerns like acne, pigmentation, and fine lines to recommend your perfect science-backed routine.
            </p>
            <Button variant="outline" className="border-2 border-foreground px-12 py-8 text-xs font-black uppercase tracking-widest rounded-none hover:bg-foreground hover:text-background transition-all">
              Try Now
            </Button>
          </div>
        </div>
      </section>

      {/* Shop by Category Carousel */}
      <section className="py-24 overflow-hidden bg-foreground text-background">
        <div className="container mx-auto px-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-black tracking-tighter uppercase text-center">Shop by Category</h2>
        </div>
        <div className="flex gap-8 overflow-x-auto pb-12 snap-x px-4 md:px-20 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <Link 
              key={cat.id} 
              href={`/collections?category=${cat.id}`}
              className="relative min-w-[300px] md:min-w-[400px] aspect-[3/4] group snap-center overflow-hidden"
            >
              <Image 
                src={cat.image} 
                alt={cat.name} 
                fill 
                className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
                data-ai-hint={cat.hint}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-3xl font-black uppercase tracking-[0.3em] group-hover:scale-110 transition-transform">{cat.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Shop by Concerns Carousel */}
      <section className="py-24 container mx-auto px-4">
        <h2 className="text-3xl md:text-5xl font-black tracking-tighter uppercase text-center mb-16">Shop by Concerns</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {CONCERNS.map((concern) => (
            <Link 
              key={concern.id} 
              href={`/collections?concern=${concern.id}`}
              className="flex flex-col group"
            >
              <div className="relative aspect-square overflow-hidden mb-6 border-2 border-transparent group-hover:border-primary transition-all">
                <Image 
                  src={concern.image} 
                  alt={concern.name} 
                  fill 
                  className="object-cover grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-105"
                  data-ai-hint={concern.hint}
                />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-center group-hover:text-primary transition-colors">{concern.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Brand Values */}
      <section className="py-32 border-y">
        <div className="container mx-auto px-4 text-center mb-20">
          <h2 className="text-3xl md:text-6xl font-black tracking-tighter uppercase mb-6">The future of personal care is here</h2>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground max-w-2xl mx-auto">
            Full disclosure of ingredients used & their concentration. Formulations developed in our in-house laboratories.
          </p>
        </div>
        <div className="container mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-16">
          {[
            { icon: ShieldCheck, title: 'Transparency', desc: 'Full disclosure of ingredients used & their concentration.' },
            { icon: Microscope, title: 'Efficacy', desc: 'Formulations developed in our in-house laboratories.' },
            { icon: Droplet, title: 'Affordable', desc: 'Skincare, accessible to all, without the traditional markup.' },
            { icon: Zap, title: 'Only the Best', desc: 'Ingredients sourced from the most reputable labs across the world.' },
          ].map((val) => (
            <div key={val.title} className="flex flex-col items-center text-center group">
              <div className="w-20 h-20 border-2 border-foreground mb-8 flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-all">
                <val.icon className="h-8 w-8" />
              </div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] mb-4">{val.title}</h4>
              <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
                {val.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Floating Chat Widget Simulated */}
      <div className="fixed bottom-8 left-8 z-50 group flex flex-col items-start gap-4">
        <div className="hidden group-hover:flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-300">
          {[
            "Where is my order?",
            "Which cleanser is best for me?",
            "Show me our products"
          ].map(q => (
            <button key={q} className="bg-white border-2 border-foreground px-4 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-colors">
              {q}
            </button>
          ))}
        </div>
        <Link href="/assistant">
          <Button size="icon" className="w-16 h-16 rounded-full bg-foreground text-background shadow-2xl relative border-4 border-white">
            <Zap className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-black border-2 border-white">
              2
            </span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}
