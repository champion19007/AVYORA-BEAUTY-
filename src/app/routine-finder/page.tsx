'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { getRecommendation } from '@/lib/routine-engine';
import { RecommendationResult, RoutineStep } from '@/lib/routine-types';
import { PRODUCTS } from '@/data/mock-data';
import { ChevronLeft, ArrowRight, Loader2, CheckCircle2, Info, Moon, Sun, Zap, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const QUESTIONS = [
  {
    id: 'concern',
    label: "WHAT IS YOUR PRIMARY CONCERN?",
    options: [
      { value: 'acne', label: 'Acne & Breakouts' },
      { value: 'pigmentation', label: 'Dark Spots & Pigmentation' },
      { value: 'dullness', label: 'Dullness & Uneven Tone' },
      { value: 'lines', label: 'Fine Lines & Aging' },
      { value: 'texture', label: 'Texture & Roughness' },
      { value: 'dryness', label: 'Dryness' },
      { value: 'simple', label: 'Just Want a Simple Routine' }
    ]
  },
  {
    id: 'secondaryConcerns',
    label: "DO YOU HAVE ANY OTHER CONCERNS?",
    multi: true,
    options: [
      { value: 'acne', label: 'Acne & Breakouts' },
      { value: 'pigmentation', label: 'Dark Spots' },
      { value: 'dullness', label: 'Dullness' },
      { value: 'uneven', label: 'Uneven Tone' },
      { value: 'lines', label: 'Fine Lines' },
      { value: 'texture', label: 'Texture' },
      { value: 'dryness', label: 'Dryness' },
      { value: 'tanning', label: 'Tanning' },
      { value: 'circles', label: 'Dark Circles' },
      { value: 'oily', label: 'Oiliness' },
      { value: 'none', label: 'None' }
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
      { value: 'very', label: 'Very reactive / sensitive' }
    ]
  },
  {
    id: 'age',
    label: "WHAT IS YOUR AGE?",
    options: [
      { value: 'under18', label: 'Under 18' },
      { value: '18-24', label: '18–24' },
      { value: '25-34', label: '25–34' },
      { value: '35-44', label: '35–44' },
      { value: '45plus', label: '45+' }
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
      { value: 'experienced', label: "I'm experienced with active ingredients" }
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
      const currentValues = answers[q.id] || [];
      if (currentValues.includes(value)) {
        newAnswers[q.id] = currentValues.filter((v: string) => v !== value);
      } else {
        newAnswers[q.id] = [...currentValues, value];
      }
      setAnswers(newAnswers);
      // Multi-select doesn't auto-advance
      return;
    }

    newAnswers[q.id] = value;
    setAnswers(newAnswers);

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      setIsAnalyzing(true);
      setTimeout(() => {
        const recommendation = getRecommendation(newAnswers);
        setResult(recommendation);
        setIsAnalyzing(false);
      }, 2000);
    }
  };

  const handleContinue = () => {
    if (step < QUESTIONS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
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
        <h2 className="text-2xl font-black uppercase tracking-tighter">BUILDING YOUR PERSONALIZED ROUTINE...</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Synthesizing clinical data for your specific skin profile.</p>
      </div>
    );
  }

  if (result) {
    const p = result.profile;
    return (
      <div className="container mx-auto px-4 py-12 max-w-6xl animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center mb-16 space-y-6">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Avyora Skin Diagnostic v2.0</span>
          <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-[0.9]">YOUR PERSONALIZED<br/>AVYORA ROUTINE</h1>
          <div className="flex flex-wrap justify-center gap-2 text-[8px] font-black uppercase tracking-widest text-muted-foreground">
            <span className="bg-muted px-3 py-1">{p.skinType} Skin</span>
            {result.priorityConcerns.map(c => <span key={c} className="bg-muted px-3 py-1">{c}</span>)}
            <span className="bg-primary/20 text-primary px-3 py-1">{result.experienceLevel}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-8 space-y-20">
            {/* Morning Routine */}
            <section className="space-y-12">
              <h2 className="text-xs font-black uppercase tracking-[0.4em] pb-4 border-b-2 border-foreground flex items-center gap-3">
                <Sun className="h-4 w-4 text-orange-400" /> Morning Cycle
              </h2>
              <div className="space-y-10">
                {result.morningRoutine.map(step => <RoutineStepCard key={step.order} step={step} />)}
              </div>
            </section>

            {/* Evening Routine */}
            <section className="space-y-12">
              <h2 className="text-xs font-black uppercase tracking-[0.4em] pb-4 border-b-2 border-foreground flex items-center gap-3">
                <Moon className="h-4 w-4 text-indigo-400" /> Evening Cycle
              </h2>
              <div className="space-y-10">
                {result.eveningRoutine.map(step => <RoutineStepCard key={step.order} step={step} />)}
              </div>
            </section>

            {/* Body Care */}
            {result.bodyRoutine.length > 0 && (
              <section className="space-y-12">
                <h2 className="text-xs font-black uppercase tracking-[0.4em] pb-4 border-b-2 border-foreground flex items-center gap-3">
                  <Zap className="h-4 w-4 text-primary" /> Body Care
                </h2>
                <div className="space-y-10">
                  {result.bodyRoutine.map(step => <RoutineStepCard key={step.order} step={step} />)}
                </div>
              </section>
            )}
          </div>

          <div className="lg:col-span-4 space-y-8">
            <Card className="rounded-none border-2 border-foreground bg-primary/5 sticky top-32">
              <CardContent className="p-8 space-y-10">
                <div className="space-y-4">
                  <h3 className="text-lg font-black uppercase tracking-tighter">Diagnostic Summary</h3>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Priority Focus</h4>
                      <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                        {result.explanations.join(' ')}
                      </p>
                    </div>
                    {result.warnings.length > 0 && (
                      <div>
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-destructive mb-2">Clinical Cautions</h4>
                        <ul className="space-y-2">
                          {result.warnings.map((w, i) => (
                            <li key={i} className="text-[9px] font-bold uppercase tracking-widest flex items-start gap-2">
                              <Info className="h-3 w-3 shrink-0" /> {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {result.treatmentSchedule?.retinol && (
                  <div className="p-6 bg-foreground text-background space-y-4">
                    <h4 className="text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                      <Zap className="h-3 w-3" /> Retinol Schedule
                    </h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                      {result.treatmentSchedule.retinol}
                    </p>
                  </div>
                )}

                <div className="pt-8 border-t border-foreground/10 space-y-4">
                  <Button onClick={handleAddAll} className="w-full h-14 rounded-none bg-foreground text-background font-black uppercase tracking-widest hover:bg-primary transition-all">
                    Add Routine to Cart
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setResult(null); setStep(0); setAnswers({}); }} className="flex-1 text-[9px] font-black uppercase tracking-widest rounded-none border-2">
                      Retake Quiz
                    </Button>
                    <Button variant="outline" onClick={() => setResult(null)} className="flex-1 text-[9px] font-black uppercase tracking-widest rounded-none border-2">
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
        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.4em] text-muted-foreground">
          <span>Step {step + 1} of {QUESTIONS.length}</span>
          <span>{Math.round(progress)}% Diagnostic Complete</span>
        </div>
        <Progress value={progress} className="h-1 bg-muted overflow-hidden rounded-none">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </Progress>
      </div>

      <div className="flex-1 space-y-16 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="space-y-4">
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="icon" onClick={handleBack} disabled={step === 0} className="rounded-none border-2 border-foreground/10 h-12 w-12 shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-none">{q.label}</h2>
          </div>
          {q.multi && <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-20">Multiple selections allowed</p>}
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
                  "text-[10px] font-black uppercase tracking-widest transition-colors",
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
            <Button onClick={handleContinue} className="h-16 px-12 rounded-none bg-foreground text-background font-black uppercase tracking-widest hover:bg-primary transition-all">
              Continue <ArrowRight className="ml-3 h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-24 pt-10 border-t border-foreground/5 text-center">
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground italic">Avyora Clinical Diagnostics Engine v2.0 · Professional Use Authorized</p>
      </div>
    </div>
  );
}

function RoutineStepCard({ step }: { step: RoutineStep }) {
  const product = step.productId ? PRODUCTS.find(p => p.id === step.productId) : null;
  
  return (
    <div className="flex flex-col md:flex-row gap-8 items-start group">
      <div className="w-full md:w-48 aspect-square relative border shrink-0 bg-muted overflow-hidden">
        {step.isAvyoraProduct && product ? (
          <Image src={product.images[0]} alt={product.name} fill className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700" data-ai-hint="skincare bottle" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-muted/50 border-dashed border-2">
            <ShieldCheck className="h-8 w-8 mb-4 opacity-20" />
            <p className="text-[8px] font-black uppercase tracking-widest opacity-40">Coming Soon to Avyora</p>
          </div>
        )}
      </div>
      <div className="space-y-4 flex-1">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-black uppercase tracking-[0.2em]">{step.label}</h3>
          <span className="text-[9px] font-black uppercase tracking-widest text-primary">{step.order.toString().padStart(2, '0')}</span>
        </div>
        <div className="space-y-2">
          <h4 className="text-[11px] font-black uppercase tracking-widest">
            {step.isAvyoraProduct ? `Avyora ${product?.name}` : 'Facial Moisturizer'}
            {step.productSize && <span className="text-primary ml-2">— {step.productSize}</span>}
          </h4>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
            {step.explanation}
          </p>
          {step.frequency && (
            <div className="flex items-center gap-2 mt-2">
              <Zap className="h-3 w-3 text-primary" />
              <span className="text-[9px] font-black uppercase tracking-widest text-primary">{step.frequency}</span>
            </div>
          )}
          {!step.isAvyoraProduct && (
            <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-2 py-1 w-fit mt-4 italic">
              Use a generic pH-balanced moisturizer until our clinical formulation launches.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
