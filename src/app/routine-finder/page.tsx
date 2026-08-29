'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getRecommendation } from '@/lib/routine-engine';
import { RecommendationResult, RoutineStep } from '@/lib/routine-types';
import { getProductById } from '@/lib/catalogue';
import {
  ChevronLeft,
  ArrowRight,
  Loader2,
  Info,
  Moon,
  Sun,
  Sparkles,
  AlertTriangle,
  ShoppingBag,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

type Question = {
  id: string;
  label: string;
  help?: string;
  multi?: boolean;
  options: { value: string; label: string }[];
};

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

/** One step of a routine, with the matching product pulled from the catalogue. */
function StepCard({ step }: { step: RoutineStep }) {
  const { addToCart } = useApp();
  const [added, setAdded] = useState(false);
  const product = step.productId ? getProductById(step.productId) : undefined;
  const size = step.productSize || product?.sizes[0]?.label;

  const handleAdd = () => {
    if (!product || !size) return;
    addToCart(product, size);
    setAdded(true);
  };

  return (
    <li className="flex gap-5 border-b border-border py-6 last:border-b-0">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-28 sm:w-28">
        {product ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="112px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Info className="h-5 w-5 opacity-30" />
          </div>
        )}
        <span className="absolute left-0 top-0 rounded-br-lg bg-foreground/85 px-2 py-0.5 text-[10px] font-semibold text-background">
          {String(step.order).padStart(2, '0')}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
          {step.slotName}
        </p>
        <h3 className="mt-1 font-headline text-lg font-normal tracking-[0.02em]">
          {product ? (
            <Link href={`/products/${product.slug}`} className="hover:text-primary">
              {product.name}
            </Link>
          ) : (
            step.productName
          )}
        </h3>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.explanation}</p>

        {step.frequency && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            <Sparkles className="h-3 w-3" />
            {step.frequency}
          </p>
        )}

        {product && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="text-sm">
              <span className="font-medium">
                ₹{(product.salePrice ?? product.sizes[0].price).toLocaleString('en-IN')}
              </span>
              {size && <span className="text-muted-foreground"> · {size}</span>}
            </span>
            <Button
              size="sm"
              variant={added ? 'secondary' : 'outline'}
              onClick={handleAdd}
              className="h-8 rounded-md text-xs"
            >
              {added ? (
                <>
                  <Check className="mr-1.5 h-3 w-3" /> In bag
                </>
              ) : (
                <>
                  <ShoppingBag className="mr-1.5 h-3 w-3" /> Add
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function RoutineList({ steps }: { steps: RoutineStep[] }) {
  return (
    <ul>
      {steps.map((s) => (
        <StepCard key={`${s.order}-${s.slotName}`} step={s} />
      ))}
    </ul>
  );
}

export default function RoutineFinderPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const { addToCart } = useApp();
  const [addedAll, setAddedAll] = useState(false);

  const questions = QUESTIONS as Question[];
  const q = questions[step];

  const submit = (finalAnswers: Record<string, any>) => {
    setIsAnalyzing(true);
    // A short beat so the transition reads as deliberate. The engine is
    // synchronous, so there is nothing genuine to wait for; the previous
    // two-second "synthesizing clinical data" pause was pure theatre.
    setTimeout(() => {
      setResult(getRecommendation(finalAnswers));
      setIsAnalyzing(false);
    }, 600);
  };

  const handleAnswer = (value: string) => {
    const next = { ...answers };

    if (q.multi) {
      const current: string[] = answers[q.id] || [];
      if (value === 'None') {
        next[q.id] = current.includes('None') ? [] : ['None'];
      } else if (current.includes(value)) {
        next[q.id] = current.filter((v) => v !== value);
      } else {
        next[q.id] = [...current.filter((v) => v !== 'None'), value];
      }
      setAnswers(next);
      return;
    }

    next[q.id] = value;
    setAnswers(next);
    if (step < questions.length - 1) setStep(step + 1);
    else submit(next);
  };

  const handleContinue = () => {
    if (step < questions.length - 1) setStep(step + 1);
    else submit(answers);
  };

  const restart = () => {
    setResult(null);
    setAnswers({});
    setStep(0);
    setAddedAll(false);
  };

  const shoppingList = useMemo(() => {
    if (!result) return [];
    return result.recommendedProducts
      .map((r) => ({ product: getProductById(r.productId), size: r.size }))
      .filter((x): x is { product: NonNullable<typeof x.product>; size: string } => !!x.product);
  }, [result]);

  const total = shoppingList.reduce(
    (sum, { product }) => sum + (product.salePrice ?? product.sizes[0].price),
    0
  );

  const handleAddAll = () => {
    shoppingList.forEach(({ product, size }) => addToCart(product, size || product.sizes[0].label));
    setAddedAll(true);
  };

  /* ---------------------------------------------------------------- loading */
  if (isAnalyzing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <h1 className="font-headline text-2xl font-normal tracking-[0.02em]">
          Building your routine
        </h1>
        <p className="text-sm text-muted-foreground">Matching your answers to our formulations.</p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- results */
  if (result) {
    const p = result.profile;
    const hasBody = result.bodyRoutine.length > 0;

    return (
      <div className="container mx-auto max-w-5xl px-4 py-14">
        <header className="mb-12 text-center">
          <span className="eyebrow">Your routine</span>
          <h1 className="mt-3 font-headline text-3xl font-normal tracking-[0.02em] md:text-4xl">
            Built for {p.skinType} skin
          </h1>
          <span className="rule-gold mx-auto mt-7 max-w-xs" aria-hidden="true" />
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">
              {p.skinType} skin
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs">{p.primaryConcern}</span>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
              {result.experienceLevelName.toLowerCase()}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Tabs defaultValue="am">
              <TabsList className="mb-2 w-full justify-start rounded-lg">
                <TabsTrigger value="am" className="gap-2 text-xs">
                  <Sun className="h-3.5 w-3.5" /> Morning
                </TabsTrigger>
                <TabsTrigger value="pm" className="gap-2 text-xs">
                  <Moon className="h-3.5 w-3.5" /> Evening
                </TabsTrigger>
                {hasBody && (
                  <TabsTrigger value="body" className="text-xs">
                    Body
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="am">
                <p className="mb-2 text-sm text-muted-foreground">
                  {result.morningRoutine.length} steps · {result.morningTitle}
                </p>
                <RoutineList steps={result.morningRoutine} />
              </TabsContent>
              <TabsContent value="pm">
                <p className="mb-2 text-sm text-muted-foreground">
                  {result.eveningRoutine.length} steps · {result.eveningTitle}
                </p>
                <RoutineList steps={result.eveningRoutine} />
              </TabsContent>
              {hasBody && (
                <TabsContent value="body">
                  <RoutineList steps={result.bodyRoutine} />
                </TabsContent>
              )}
            </Tabs>
          </div>

          <aside className="space-y-8">
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-headline text-lg font-normal tracking-[0.02em]">
                Why this routine
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {result.whyThisRoutine}
              </p>
            </section>

            {result.treatmentSchedule?.retinol && (
              <section className="rounded-xl border border-primary/30 bg-primary/5 p-6">
                <h2 className="font-headline text-lg font-normal tracking-[0.02em]">
                  Building up retinol
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {result.treatmentSchedule.retinol}
                </p>
              </section>
            )}

            {result.underEyeGuidance && (
              <section className="rounded-xl border border-border p-6">
                <h2 className="font-headline text-lg font-normal tracking-[0.02em]">Under-eye</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {result.underEyeGuidance}
                </p>
              </section>
            )}

            {result.warnings.length > 0 && (
              <section className="rounded-xl border border-border bg-muted/40 p-6">
                <h2 className="flex items-center gap-2 font-headline text-lg font-normal tracking-[0.02em]">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Before you start
                </h2>
                <ul className="mt-3 space-y-3">
                  {result.warnings.map((w) => (
                    <li key={w} className="text-sm leading-relaxed text-muted-foreground">
                      {w}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-headline text-lg font-normal tracking-[0.02em]">
                Everything in this routine
              </h2>
              <ul className="mt-4 space-y-2">
                {shoppingList.map(({ product }) => (
                  <li key={product.id} className="flex justify-between gap-3 text-sm">
                    <Link href={`/products/${product.slug}`} className="truncate hover:text-primary">
                      {product.name}
                    </Link>
                    <span className="shrink-0 text-muted-foreground">
                      ₹{(product.salePrice ?? product.sizes[0].price).toLocaleString('en-IN')}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-between border-t border-border pt-4 text-sm font-medium">
                <span>Total</span>
                <span>₹{total.toLocaleString('en-IN')}</span>
              </div>
              <Button
                onClick={handleAddAll}
                className="mt-5 w-full rounded-md py-6 text-xs font-semibold uppercase tracking-[0.18em]"
              >
                {addedAll ? 'Added to bag' : 'Add all to bag'}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Or add steps individually as you go.
              </p>
            </section>

            <Button variant="ghost" onClick={restart} className="w-full gap-2 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </Button>
          </aside>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- questions */
  const selected: string[] = q.multi ? answers[q.id] || [] : [];
  const progress = ((step + 1) / questions.length) * 100;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-14">
      <div className="mb-10">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Question {step + 1} of {questions.length}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      <div key={step} className="animate-fade-up">
        <div className="mb-8 flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous question"
            onClick={() => step > 0 && setStep(step - 1)}
            disabled={step === 0}
            className="mt-1 h-10 w-10 shrink-0 rounded-full border border-border"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-headline text-2xl font-normal leading-snug tracking-[0.02em] md:text-3xl">
              {q.label}
            </h1>
            {q.help && (
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{q.help}</p>
            )}
            {q.multi && (
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-primary">
                Choose as many as apply
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {q.options.map((opt, i) => {
            const isSelected = q.multi ? selected.includes(opt.value) : answers[q.id] === opt.value;
            return (
              <button
                key={`${opt.value}-${i}`}
                onClick={() => handleAnswer(opt.value)}
                aria-pressed={isSelected}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-5 py-4 text-left text-sm transition-all',
                  isSelected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>

        {q.multi && (
          <Button
            onClick={handleContinue}
            className="mt-8 w-full gap-2 rounded-md py-6 text-xs font-semibold uppercase tracking-[0.18em] sm:w-auto sm:px-12"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="mt-14 border-t border-border pt-8 text-center text-xs leading-relaxed text-muted-foreground">
        This gives general guidance, not medical advice. If you have a persistent or painful skin
        condition, please see a dermatologist.
      </p>
    </div>
  );
}
