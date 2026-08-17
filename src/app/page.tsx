'use client';

import { PRODUCTS, CATEGORIES, CONCERNS } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Info, ShieldCheck, Microscope, Zap } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  const bestSellers = PRODUCTS.filter(p => p.isBestSeller);
  const newLaunches = PRODUCTS.filter(p => p.isNewLaunch);

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative h-[80vh] w-full overflow-hidden bg-muted">
        <Image 
          src="https://picsum.photos/seed/hero/1920/1080" 
          alt="Hero" 
          fill 
          className="object-cover opacity-90"
          priority
          data-ai-hint="skincare products"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
        <div className="absolute inset-0 container mx-auto px-4 flex flex-col justify-center items-start text-white">
          <h1 className="text-4xl md:text-7xl max-w-2xl mb-6 font-bold tracking-tighter">Science-Backed Care.</h1>
          <p className="text-sm md:text-lg uppercase tracking-[0.2em] mb-8 opacity-80 font-bold">
            Enjoy 5% cashback on all orders.
          </p>
          <Link href="/collections">
            <Button className="bg-white text-black hover:bg-white/90 px-10 py-7 text-sm font-bold uppercase tracking-widest rounded-none">
              Shop Now
            </Button>
          </Link>
        </div>
      </section>

      {/* Best Sellers */}
      <section className="py-24 container mx-auto px-4">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight uppercase">Our Best Sellers</h2>
            <div className="w-12 h-1 bg-primary mt-2" />
          </div>
          <Link href="/collections?filter=bestsellers" className="text-xs font-bold uppercase tracking-widest hover:text-primary flex items-center gap-2 pb-1 border-b border-transparent hover:border-primary transition-all">
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {bestSellers.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Bundle Promo */}
      <section className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center bg-white p-8 md:p-16 border border-border/50">
            <div className="space-y-8">
              <h2 className="text-3xl md:text-5xl leading-tight font-bold tracking-tighter">Build Your Own Bundle!</h2>
              <ul className="space-y-4">
                <li className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
                  <Zap className="h-4 w-4 text-primary" />
                  Get Additional Discount UPTO 15%
                </li>
                <li className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
                  <Zap className="h-4 w-4 text-primary" />
                  +5% Cashback as Mcash
                </li>
              </ul>
              <Button className="bg-primary text-primary-foreground px-10 py-7 font-bold uppercase tracking-widest rounded-none">
                Shop The Bundle
              </Button>
            </div>
            <div className="relative aspect-video lg:aspect-square bg-muted">
              <Image 
                src="https://picsum.photos/seed/bundle/800/800" 
                alt="Bundle" 
                fill 
                className="object-cover"
                data-ai-hint="skincare bundle"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Shop by Category */}
      <section className="py-24 container mx-auto px-4 overflow-hidden">
        <h2 className="text-2xl md:text-4xl font-bold tracking-tight uppercase mb-12 text-center">Shop by Category</h2>
        <div className="flex gap-6 overflow-x-auto pb-8 snap-x no-scrollbar">
          {CATEGORIES.map((cat) => (
            <Link 
              key={cat.id} 
              href={`/collections?category=${cat.id}`}
              className="relative min-w-[280px] md:min-w-[320px] aspect-[3/4] group snap-start bg-muted"
            >
              <Image 
                src={cat.image} 
                alt={cat.name} 
                fill 
                className="object-cover transition-transform duration-700 group-hover:scale-110"
                data-ai-hint={cat.hint}
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-xl font-bold uppercase tracking-[0.2em] z-10">{cat.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Shop by Concerns */}
      <section className="py-24 bg-foreground text-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight uppercase mb-12 text-center">Shop by Concerns</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {CONCERNS.map((concern) => (
              <Link 
                key={concern.id} 
                href={`/collections?concern=${concern.id}`}
                className="flex flex-col items-center group"
              >
                <div className="relative w-full aspect-square overflow-hidden mb-6 bg-muted">
                  <Image 
                    src={concern.image} 
                    alt={concern.name} 
                    fill 
                    className="object-cover grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-110"
                    data-ai-hint={concern.hint}
                  />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] group-hover:text-primary transition-colors">{concern.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* New Launches */}
      <section className="py-24 container mx-auto px-4">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight uppercase">New Launches</h2>
            <div className="w-12 h-1 bg-primary mt-2" />
          </div>
          <Link href="/collections?filter=new" className="text-xs font-bold uppercase tracking-widest hover:text-primary flex items-center gap-2 pb-1 border-b border-transparent hover:border-primary transition-all">
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {newLaunches.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Brand Values Strip */}
      <section className="py-24 bg-white border-y">
        <div className="container mx-auto px-4 text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight uppercase mb-6">The future of personal care is here</h2>
          <p className="text-muted-foreground uppercase tracking-widest text-[10px] max-w-2xl mx-auto font-bold">
            Full disclosure of ingredients used & their concentration. Formulations developed in our in-house laboratories.
          </p>
        </div>
        <div className="container mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
          {[
            { icon: Info, title: 'Transparency', desc: 'Full disclosure of ingredients used & their concentration.' },
            { icon: Microscope, title: 'Efficacy', desc: 'Formulations developed in our in-house laboratories.' },
            { icon: ShieldCheck, title: 'Affordable', desc: 'Skincare, accessible to all, without the markup.' },
            { icon: Zap, title: 'Only the Best', desc: 'Ingredients sourced from across the world.' },
          ].map((val) => (
            <div key={val.title} className="flex flex-col items-center text-center group">
              <div className="w-16 h-16 border border-border mb-6 flex items-center justify-center transition-colors group-hover:border-primary">
                <val.icon className="h-6 w-6" />
              </div>
              <h4 className="text-xs font-bold uppercase tracking-widest mb-4">{val.title}</h4>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-relaxed">
                {val.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
