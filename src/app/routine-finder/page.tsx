'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { getRecommendation } from '@/lib/routine-engine';
import { RecommendationResult, RoutineStep } from '@/lib/routine-types';
import { PRODUCTS } from '@/data/mock-data';
import { ChevronLeft, ArrowRight, Loader2, CheckCircle2, Info, Moon, Sun, Zap, AlertTriangle, ShoppingBag } from 'lucide-react';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const QUESTIONS = [
  {
    id: 'concern',
    label: "WHAT IS YOUR PRIMARY CONCERN?",
    options: [
      { value: 'Acne & Breakouts', label: 'Acne & Breakouts' },
      { value: 'Dark Spots & Pigmentation', label: 'Dark Spots & Pigmentation' },
      { value: 'Dullness & Uneven Tone', label: 'Dullness & Uneven Tone' },
      { value: 'Fine Lines & Aging', label: 'Fine Lines & Aging' },
      { value: 'Texture & Roughness', label: 'Texture & Roughness' },
      { value: 'Dryness', label: 'Dryness' },
      { value: 'Just Want a Simple Routine', label: 'Just Want a Simple Routine' }
    ]
  },
  {
    id: 'secondaryConcerns',
    label: "DO YOU HAVE ANY OTHER CONCERNS?",
    multi: true,
    options: [
      { value: 'Acne & Breakouts', label: 'Acne & Breakouts' },
      { value: 'Dark Spots', label: 'Dark Spots' },
      { value: 'Dullness', label: 'Dullness' },
      { value: 'Uneven Tone', label: 'Uneven Tone' },
      { value: 'Fine Lines', label: 'Fine Lines' },
      { value: 'Texture', label: 'Texture' },
      { value: 'Dryness', label: 'Dryness' },
      { value: 'Tanning', label: 'Tanning' },
      { value: 'Dark Circles', label: 'Dark Circles' },
      { value: 'Oiliness', label: 'Oiliness' },
      { value: 'None', label: 'None' }
    ]
  },
  {
    id: 'skinType',
    label: "WHAT IS YOUR SKIN TYPE?",
    options: [
      { value: 'oily', label: 'Oily' },
      { value: 'dry', label: 'Dry' },
      { value: 'combination', label: 'Combination' },
      { value: 'normal', label: 'Normal' },
      { value: 'sensitive', label: 'Sensitive' }
    ]
  },
  {
    id: 'reactivity',
    label: "HOW REACTIVE IS YOUR SKIN?",
    options: [
      { value: 'rarely', label: 'Rarely reacts to products' },
      { value: 'sometimes', label: 'Sometimes gets irritated' },
      { value: 'easily', label: 'Easily irritated' },
      { value: 'very_high', label: 'Very reactive / sensitive' }
    ]
  },
  {
    id: 'age',
    label: "WHAT IS YOUR AGE?",
    options: [
      { value: 'under18', label: 'Under 18' },
      { value: '18_24', label: '18–24' },
      { value: '25_34', label: '25–34' },
      { value: '35_44', label: '35–44' },
      { value: '45_plus', label: '45+' }
    ]
  },
  {
    id: 'sun',
    label: "HOW MUCH SUN EXPOSURE DO YOU GET?",
    options: [
      { value: 'indoors', label: 'Mostly indoors' },
      { value: 'moderate', label: 'Moderate outdoor exposure' },
      { value: 'outdoors', label: 'Outdoors often' },
      { value: 'high', label: 'High sun exposure' }
    ]
  },
  {
    id: 'experience',
    label: "HOW EXPERIENCED ARE YOU WITH SKINCARE?",
    options: [
      { value: 'none', label: 'I have no routine' },
      { value: 'beginner', label: "I'm a beginner" },
      { value: 'basic', label: 'I follow a basic routine' },
      { value: 'regular', label: 'I follow skincare regularly' },
      { value: 'experienced', label: "I'm serious about skincare" }
    ]
  },
  {
    id: 'consistency',
    label: "HOW CONSISTENT ARE YOU WITH SKINCARE?",
    options: [
      { value: 'rarely', label: 'I rarely follow a routine' },
      { value: 'few', label: 'A few days per week' },
      { value: 'most', label: 'Most days' },
      { value: 'every', label: 'Every day' }
    ]
  },
  {
    id: 'currentCondition',
    label: "HOW WOULD YOU DESCRIBE YOUR SKIN RIGHT NOW?",
    options: [
      { value: 'clear', label: 'Mostly clear' },
      { value: 'occasional', label: 'Occasional breakouts' },
      { value: 'frequent', label: 'Frequent breakouts' },
      { value: 'pigmentation', label: 'Pigmentation / dark spots' },
      { value: 'dry', label: 'Very dry' },
      { value: 'texture', label: 'Rough / uneven texture' },
      { value: 'irritated', label: 'Irritated' },
      { value: 'multiple', label: 'Multiple concerns' }
    ]
  },
  {
    id: 'darkCircles',
    label: "DO YOU HAVE DARK CIRCLES UNDER YOUR EYES?",
    options: [
      { value: 'no', label: 'No' },
      { value: 'mild', label: 'Mild' },
      { value: 'noticeable', label: 'Noticeable' },
      { value: 'significant', label: 'Significant' }
    ]
  },
  {
    id: 'darkSpots',
    label: "DO YOU HAVE DARK SPOTS OR PIGMENTATION?",
    options: [
      { value: 'no', label: 'No' },
      { value: 'few', label: 'A few' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'significant', label: 'Significant' }
    ]
  },
  {
    // Retinoids are contraindicated in pregnancy and breastfeeding, so the
    // engine needs to know before it can recommend one.
    id: 'pregnancy',
    label: "ARE YOU PREGNANT OR BREASTFEEDING?",
    help: "Retinoids are not recommended during pregnancy or breastfeeding, so we will leave them out of your routine.",
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'no', label: 'Prefer not to say' }
    ]
  },
  {
    id: 'bodyCare',
    label: "DO YOU WANT BODY CARE INCLUDED?",
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' }
    ]
  }
];

export default function RoutineFinderPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<any>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const { addToCart } = useApp();

  const handleAnswer = (value: string) => {
    const q = QUESTIONS[step];
    let newAnswers = { ...answers };

    if (q.multi) {
      let currentValues = answers[q.id] || [];
      
      if (value === 'None') {
        // If "None" is clicked, it becomes the only selection, or gets cleared if already selected
        if (currentValues.includes('None')) {
          newAnswers[q.id] = [];
        } else {
          newAnswers[q.id] = ['None'];
        }
      } else {
        // If a specific concern is clicked
        if (currentValues.includes(value)) {
          // Deselect it
          newAnswers[q.id] = currentValues.filter((v: string) => v !== value);
        } else {
          // Select it and remove "None" if it was present
          newAnswers[q.id] = [...currentValues.filter((v: string) => v !== 'None'), value];
        }
      }
      
      setAnswers(newAnswers);
      return;
    }

    newAnswers[q.id] = value;
    setAnswers(newAnswers);

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      setIsAnalyzing(true);
      setTimeout(() => {
        const rec = getRecommendation(newAnswers);
        setResult(rec);
        setIsAnalyzing(false);
      }, 2000);
    }
  };

  const handleAddAll = () => {
    if (!result) return;
    result.recommendedProducts.forEach(rec => {
      const product = PRODUCTS.find(p => p.id === rec.productId);
      if (product) addToCart(product, rec.size);
    });
  };

  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center animate-in fade-in duration-500">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <h2 className="text-2xl font-semibold uppercase tracking-tighter">BUILDING YOUR PERSONALIZED ROUTINE...</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Synthesizing clinical data for your specific skin profile.</p>
      </div>
    );
  }

  if (result) {
    const p = result.profile;
    return (
      <div className="container mx-auto px-4 py-12 max-w-6xl animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center mb-16 space-y-6">
          <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-primary">Avyora Skin Diagnostic</span>
          <h1 className="text-4xl md:text-7xl font-semibold uppercase tracking-tighter leading-[0.9]">YOUR PERSONALIZED<br/>AVYORA ROUTINE</h1>
          <div className="flex flex-wrap justify-center gap-2 text-[8px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="bg-muted px-3 py-1">{p.skinType.toUpperCase()} SKIN</span>
            {result.priorities.map(c => <span key={c} className="bg-muted px-3 py-1">{c}</span>)}
            <span className="bg-primary/20 text-primary px-3 py-1">{result.experienceLevelName}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-8 space-y-20">
            <section className="space-y-12">
              <div className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.4em] pb-4 border-b border-border flex items-center gap-3">
                  <Sun className="h-4 w-4 text-orange-400" /> Morning Routine: {result.morningTitle}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Every user gets a complete 7-step morning regimen for optimized dermal health.
                </p>
              </div>
              <div className="space-y-10">
                {result.morningRoutine.map(step => <RoutineStepCard key={`${step.order}-${step.label}`} step={step} />)}
              </div>
            </section>

            <section className="space-y-12">
              <div className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.4em] pb-4 border-b border-border flex items-center gap-3">
                  <Moon className="h-4 w-4 text-indigo-400" /> Evening Routine: {result.eveningTitle}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Every user gets a complete 7-step evening regimen for overnight skin recovery.
                </p>
              </div>
              <div className="space-y-10">
                {result.eveningRoutine.map(step => <RoutineStepCard key={`${step.order}-${step.label}`} step={step} />)}
              </div>
            </section>

            {result.underEyeGuidance && (
              <section className="space-y-8 bg-muted/30 p-8 border-l-4 border-primary">
                <h2 className="text-xs font-semibold uppercase tracking-[0.4em] flex items-center gap-3">
                   <Info className="h-4 w-4 text-primary" /> Under-Eye Concern
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed text-muted-foreground">
                  {result.underEyeGuidance}
                </p>
              </section>
            )}

            {result.bodyRoutine.length > 0 && (
              <section className="space-y-12">
                <h2 className="text-xs font-semibold uppercase tracking-[0.4em] pb-4 border-b border-border flex items-center gap-3">
                  <Zap className="h-4 w-4 text-primary" /> Body Care
                </h2>
                <div className="space-y-10">
                  {result.bodyRoutine.map(step => <RoutineStepCard key={`${step.order}-${step.label}`} step={step} />)}
                </div>
              </section>
            )}
          </div>

          <div className="lg:col-span-4 space-y-8">
            <Card className="rounded-md border border-border bg-primary/5 sticky top-32">
              <CardContent className="p-8 space-y-10">
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold uppercase tracking-tighter">Diagnostic Summary</h3>
                  
                  <div className="space-y-4">
                    <h4 className="text-[9px] font-semibold uppercase tracking-widest text-primary">Top Skin Priorities</h4>
                    <div className="space-y-2">
                      {result.priorities.map((p, i) => (
                        <div key={i} className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-primary" /> {p}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[9px] font-semibold uppercase tracking-widest text-primary">Why This Routine?</h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                      {result.whyThisRoutine}
                    </p>
                  </div>

                  {result.warnings.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[9px] font-semibold uppercase tracking-widest text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3" /> Clinical Cautions
                      </h4>
                      <ul className="space-y-2">
                        {result.warnings.map((w, i) => (
                          <li key={i} className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {result.treatmentSchedule?.retinol && (
                  <div className="p-6 bg-foreground text-background space-y-4 shadow-luxe">
                    <h4 className="text-[9px] font-semibold uppercase tracking-widest flex items-center gap-2">
                      <Zap className="h-3 w-3 text-primary" /> Retinol Introduction
                    </h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                      {result.treatmentSchedule.retinol}
                    </p>
                  </div>
                )}

                <div className="pt-8 border-t border-foreground/10 space-y-4">
                  <Button onClick={handleAddAll} className="w-full h-14 rounded-md bg-foreground text-background font-semibold uppercase tracking-widest hover:bg-primary transition-all shadow-luxe hover:shadow-none">
                    Add Routine to Cart
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setResult(null); setStep(0); setAnswers({}); }} className="flex-1 text-[9px] font-semibold uppercase tracking-widest rounded-md border-2 h-12">
                      Retake Quiz
                    </Button>
                    <Button variant="outline" onClick={() => setResult(null)} className="flex-1 text-[9px] font-semibold uppercase tracking-widest rounded-md border-2 h-12">
                      Edit Answers
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[step];
  const progress = ((step + 1) / QUESTIONS.length) * 100;

  return (
    <div className="container mx-auto px-4 py-20 max-w-4xl min-h-[70vh] flex flex-col">
      <div className="space-y-8 mb-20">
        <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.4em] text-muted-foreground">
          <span>Step {step + 1} of {QUESTIONS.length}</span>
          <span>{Math.round(progress)}% Diagnostic Complete</span>
        </div>
        <Progress value={progress} className="h-1 bg-muted overflow-hidden rounded-md">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </Progress>
      </div>

      <div className="flex-1 space-y-16 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="space-y-4">
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="icon" onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0} className="rounded-md border border-border/10 h-12 w-12 shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="font-headline text-3xl font-light leading-tight tracking-tight md:text-5xl">{q.label}</h2>
          </div>
          {q.multi && <p className="ml-20 text-xs font-medium uppercase tracking-[0.2em] text-primary">Multiple selections allowed</p>}
          {'help' in q && q.help && (
            <p className="ml-0 max-w-xl text-sm leading-relaxed text-muted-foreground md:ml-20">{q.help}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 ml-0 md:ml-20">
          {q.options.map((opt) => {
            const isSelected = q.multi && (answers[q.id] || []).includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => handleAnswer(opt.value)}
                className={cn(
                  "p-8 border-2 text-left transition-all duration-300 relative group overflow-hidden",
                  isSelected ? "border-primary bg-primary/5" : "border-foreground/10 hover:border-primary"
                )}
              >
                <div className={cn(
                  "absolute inset-0 bg-primary translate-y-full group-hover:translate-y-0 transition-transform duration-300 -z-10 opacity-5",
                  isSelected && "translate-y-0"
                )} />
                <span className={cn(
                  "text-[10px] font-semibold uppercase tracking-widest transition-colors",
                  isSelected ? "text-primary" : "group-hover:text-primary"
                )}>{opt.label}</span>
                {isSelected ? (
                  <CheckCircle2 className="absolute right-6 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                ) : (
                  <ArrowRight className="absolute right-6 top-1/2 -translate-y-1/2 h-5 w-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all text-primary" />
                )}
              </button>
            );
          })}
        </div>

        {q.multi && (
          <div className="flex justify-end ml-20">
            <Button onClick={() => setStep(step + 1)} className="h-16 px-12 rounded-md bg-foreground text-background font-semibold uppercase tracking-widest hover:bg-primary transition-all shadow-luxe">
              Continue <ArrowRight className="ml-3 h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-24 pt-10 border-t border-foreground/5 text-center">
        <p className="text-[8px] font-semibold uppercase tracking-[0.4em] text-muted-foreground italic">Avyora Clinical Diagnostics Engine v2.0</p>
      </div>
    </div>
  );
}

function RoutineStepCard({ step }: { step: RoutineStep }) {
  const product = step.productId ? PRODUCTS.find(p => p.id === step.productId) : null;
  const { addToCart } = useApp();
  
  return (
    <div className="flex flex-col md:flex-row gap-8 items-start group">
      <div className={cn(
        "w-full md:w-48 aspect-square relative border shrink-0 bg-muted overflow-hidden",
        step.isAvyoraProduct ? "" : "border-dashed opacity-50"
      )}>
        {step.isAvyoraProduct && product ? (
          <Image src={product.images[0]} alt={product.name} fill className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700" data-ai-hint="skincare bottle" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
            <Info className="h-8 w-8 mb-4 opacity-20" />
            <p className="text-[8px] font-semibold uppercase tracking-widest opacity-40">Coming Soon to Avyora</p>
          </div>
        )}
      </div>
      <div className="space-y-4 flex-1">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">{step.label}</h3>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-primary">{step.order.toString().padStart(2, '0')}</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-headline text-lg font-medium tracking-wide">
              {step.productName}
              {step.productSize && step.productSize !== 'none' && <span className="text-primary ml-2">— {step.productSize}</span>}
            </h4>
            {step.isAvyoraProduct && product && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2 text-[8px] font-semibold uppercase tracking-widest hover:text-primary"
                onClick={() => addToCart(product, step.productSize || product.sizes[0].label)}
              >
                <ShoppingBag className="h-3 w-3 mr-2" /> Add
              </Button>
            )}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {step.explanation}
          </p>
          {step.frequency && (
            <div className="mt-3 flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
              <Zap className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">{step.frequency}</span>
            </div>
          )}
          {!step.isAvyoraProduct && (
            <div className="mt-4 bg-muted/50 px-2 py-1 w-fit border border-dashed">
              <span className="text-[7px] font-semibold uppercase tracking-widest opacity-40">Coming Soon / Placeholder</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
