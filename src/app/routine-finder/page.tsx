'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { getRecommendation, type RoutineAnswers, type RecommendedProduct } from '@/lib/routine-engine';
import { PRODUCTS } from '@/data/mock-data';
import { ProductCard } from '@/components/product/product-card';
import { ChevronLeft, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const QUESTIONS = [
  {
    id: 'concern',
    label: "What's your primary concern?",
    options: [
      { value: 'acne', label: 'Acne & breakouts' },
      { value: 'dullness', label: 'Dullness & uneven tone' },
      { value: 'aging', label: 'Fine lines & aging' },
      { value: 'simple', label: 'Just want a simple routine' }
    ]
  },
  {
    id: 'skinType',
    label: "What's your skin type?",
    options: [
      { value: 'oily', label: 'Oily' },
      { value: 'dry', label: 'Dry' },
      { value: 'combination', label: 'Combination' },
      { value: 'sensitive', label: 'Sensitive' }
    ]
  },
  {
    id: 'age',
    label: "What's your age range?",
    options: [
      { value: 'under25', label: 'Under 25' },
      { value: '25-35', label: '25–35' },
      { value: '35plus', label: '35+' }
    ]
  },
  {
    id: 'sun',
    label: "How much sun exposure do you get daily?",
    options: [
      { value: 'indoors', label: 'Mostly indoors' },
      { value: 'outdoors', label: 'Outdoors often' }
    ]
  },
  {
    id: 'experience',
    label: "Do you currently follow a skincare routine?",
    options: [
      { value: 'none', label: 'None' },
      { value: 'basic', label: 'Basic' },
      { value: 'advanced', label: 'Advanced' }
    ]
  },
  {
    id: 'bodyCare',
    label: "Want body care included too?",
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' }
    ]
  }
];

export default function RoutineFinderPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<RoutineAnswers>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<RecommendedProduct[] | null>(null);
  const { addToCart } = useApp();

  const handleAnswer = (value: string) => {
    const currentQuestion = QUESTIONS[step].id;
    setAnswers(prev => ({ ...prev, [currentQuestion]: value }));
    
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      setIsAnalyzing(true);
      setTimeout(() => {
        const recommendation = getRecommendation({ ...answers, [currentQuestion]: value } as RoutineAnswers);
        setResult(recommendation);
        setIsAnalyzing(false);
      }, 2000);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleAddAll = () => {
    if (!result) return;
    result.forEach(rec => {
      const product = PRODUCTS.find(p => p.id === rec.productId);
      if (product) addToCart(product, rec.size);
    });
  };

  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center animate-in fade-in duration-500">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <h2 className="text-2xl font-black uppercase tracking-tighter">Building your clinical routine...</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Analyzing your dermal data against clinical benchmarks.</p>
      </div>
    );
  }

  if (result) {
    const hasBothSerums = result.some(r => r.productId === 'vitamin-c-serum') && result.some(r => r.productId === 'retinol');
    const amProducts = result.filter(r => r.usage === 'AM');
    const pmProducts = result.filter(r => r.usage === 'PM' || r.usage === 'AM'); // Retinol is PM, others can be both but grouped for clarity
    const anytimeProducts = result.filter(r => r.usage === 'Anytime');

    return (
      <div className="container mx-auto px-4 py-12 max-w-6xl animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center mb-16 space-y-4">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Your Personal Synthesis</span>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter">Your Optimized Routine</h1>
          {hasBothSerums && (
            <p className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 py-3 px-6 rounded-none w-fit mx-auto border border-primary/20">
              Usage Note: Use Vitamin C in the morning and Retinol at night — avoid layering both together.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-20">
          <div className="space-y-12">
            <section>
              <h2 className="text-xs font-black uppercase tracking-[0.3em] mb-8 pb-4 border-b-2 border-foreground flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-orange-400" /> AM: The Protection Cycle
              </h2>
              <div className="space-y-8">
                {amProducts.map(rec => {
                  const product = PRODUCTS.find(p => p.id === rec.productId);
                  return product && (
                    <div key={rec.productId} className="flex gap-6 items-start group">
                      <div className="w-32 aspect-square relative border shrink-0 bg-muted">
                        <img src={product.images[0]} alt={product.name} className="object-cover grayscale group-hover:grayscale-0 transition-all" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-[10px] font-black uppercase tracking-widest">{product.name} ({rec.size})</h3>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">{rec.reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-black uppercase tracking-[0.3em] mb-8 pb-4 border-b-2 border-foreground flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> PM: The Repair Cycle
              </h2>
              <div className="space-y-8">
                {result.filter(r => r.usage === 'PM' || r.productId === 'face-wash').map(rec => {
                  const product = PRODUCTS.find(p => p.id === rec.productId);
                  return product && (
                    <div key={rec.productId} className="flex gap-6 items-start group">
                      <div className="w-32 aspect-square relative border shrink-0 bg-muted">
                        <img src={product.images[0]} alt={product.name} className="object-cover grayscale group-hover:grayscale-0 transition-all" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-[10px] font-black uppercase tracking-widest">{product.name} ({rec.size})</h3>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">{rec.reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-12">
            {anytimeProducts.length > 0 && (
              <section>
                <h2 className="text-xs font-black uppercase tracking-[0.3em] mb-8 pb-4 border-b-2 border-foreground">Anytime Maintenance</h2>
                <div className="space-y-8">
                  {anytimeProducts.map(rec => {
                    const product = PRODUCTS.find(p => p.id === rec.productId);
                    return product && (
                      <div key={rec.productId} className="flex gap-6 items-start group">
                        <div className="w-32 aspect-square relative border shrink-0 bg-muted">
                          <img src={product.images[0]} alt={product.name} className="object-cover grayscale group-hover:grayscale-0 transition-all" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-[10px] font-black uppercase tracking-widest">{product.name} ({rec.size})</h3>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">{rec.reason}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <Card className="rounded-none border-2 border-foreground bg-primary/5">
              <CardContent className="p-10 space-y-8">
                <h3 className="text-2xl font-black uppercase tracking-tighter">Your Full Set</h3>
                <div className="space-y-4">
                  {result.map(rec => (
                    <div key={rec.productId} className="flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-widest">{PRODUCTS.find(p => p.id === rec.productId)?.name}</span>
                      <span className="text-[9px] font-black text-primary">{rec.size}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-6 border-t border-foreground/10 flex flex-col gap-4">
                  <Button onClick={handleAddAll} className="w-full h-14 rounded-none bg-foreground text-background font-black uppercase tracking-widest hover:bg-primary transition-all">
                    Add All to Cart
                  </Button>
                  <Button variant="ghost" onClick={() => { setResult(null); setStep(0); setAnswers({}); }} className="text-[9px] font-black uppercase tracking-widest">
                    Retake Quiz
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = QUESTIONS[step];
  const progress = ((step + 1) / QUESTIONS.length) * 100;

  return (
    <div className="container mx-auto px-4 py-20 max-w-3xl min-h-[70vh] flex flex-col">
      <div className="space-y-8 mb-16">
        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground">
          <span>Diagnostic Step {step + 1} of {QUESTIONS.length}</span>
          <span>{Math.round(progress)}% Complete</span>
        </div>
        <Progress value={progress} className="h-1 bg-muted overflow-hidden rounded-none">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </Progress>
      </div>

      <div className="flex-1 space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} disabled={step === 0} className="rounded-none border-2 border-foreground/10 h-10 w-10">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-none">{currentQuestion.label}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentQuestion.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleAnswer(opt.value)}
              className="p-8 border-2 border-foreground/10 text-left hover:border-primary group transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-primary translate-y-full group-hover:translate-y-0 transition-transform duration-300 -z-10 opacity-5" />
              <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-primary transition-colors">{opt.label}</span>
              <ArrowRight className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all text-primary" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-20 pt-10 border-t border-foreground/5 text-center">
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground">Avyora Clinical Diagnostics Engine v1.0</p>
      </div>
    </div>
  );
}