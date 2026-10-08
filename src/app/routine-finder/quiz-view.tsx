'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ALLERGEN_OPTIONS,
  activeQuestions,
  budgetProblem,
  isAnswered,
  MAX_BUDGET_RUPEES,
  UNLISTED_ALLERGEN,
  type Answers,
  type OwnedDraft,
  type Question,
} from './quiz';

const optionClass = (checked: boolean) =>
  cn(
    'flex cursor-pointer items-center gap-3 rounded-2xl border px-5 py-4 text-[15px] transition-colors',
    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
    checked ? 'border-foreground bg-foreground/[0.04]' : 'border-border hover:border-foreground/40'
  );

/**
 * One question per screen. Native radio and checkbox inputs inside a
 * fieldset give keyboard and screen-reader behaviour for free; focus moves
 * to each new question's heading. Back keeps every answer.
 */
export function QuizView({
  answers,
  onChange,
  onFinish,
  onExit,
}: {
  answers: Answers;
  onChange: (a: Answers) => void;
  onFinish: (a: Answers) => void;
  onExit: () => void;
}) {
  const questions = activeQuestions(answers);
  const [index, setIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const q = questions[Math.min(index, questions.length - 1)];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorId = useId();

  useEffect(() => {
    headingRef.current?.focus();
  }, [q.id]);
  const go = (i: number) => {
    setShowErrors(false);
    setIndex(i);
  };

  const set = (patch: Answers) => onChange({ ...answers, ...patch });
  const last = index >= questions.length - 1;
  const next = (a: Answers = answers) => {
    if (!isAnswered(q, a)) return setShowErrors(true);
    if (last) onFinish(a);
    else go(index + 1);
  };
  const skip = () => {
    const a = { ...answers, [q.id]: 'unknown' };
    onChange(a);
    next(a);
  };
  const error = showErrors ? errorFor(q, answers) : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground" aria-live="polite">
          Question {index + 1} of {questions.length}
        </p>
        <div className="mt-3 h-px w-full bg-border" aria-hidden="true">
          <div className="h-px bg-foreground transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        noValidate
      >
        <fieldset aria-describedby={error ? errorId : undefined}>
          <legend className="contents">
            <h1 ref={headingRef} tabIndex={-1} className="font-headline text-4xl font-normal leading-tight tracking-tight outline-none">
              {q.label}
            </h1>
          </legend>
          {'help' in q && q.help && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{q.help}</p>}

          <div className="mt-8">
            <QuestionBody q={q} answers={answers} set={set} onPick={(a) => next(a)} invalid={Boolean(error)} errorId={errorId} />
          </div>
          {error && (
            <p id={errorId} role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
        </fieldset>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => (index === 0 ? onExit() : go(index - 1))} className="gap-2 rounded-full">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Button>
          <Button type="submit" className="gap-2 rounded-full px-8">
            {last ? 'See my routine' : 'Continue'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          {q.kind === 'single' && q.skippable && (
            <Button type="button" variant="link" onClick={skip} className="text-muted-foreground">
              Skip this question
            </Button>
          )}
        </div>
      </form>

      <p className="mt-16 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
        General skincare guidance, not medical advice. For a persistent or painful skin condition, please see a dermatologist.
      </p>
    </div>
  );
}

function errorFor(q: Question, answers: Answers): string | null {
  if (isAnswered(q, answers)) return null;
  if (q.kind === 'budget') return budgetProblem(answers.budgetRupees);
  if (q.kind === 'allergens') return 'Choose at least one ingredient, or "Something not listed here".';
  return 'Choose an answer to continue.';
}

function QuestionBody({
  q,
  answers,
  set,
  onPick,
  invalid,
  errorId,
}: {
  q: Question;
  answers: Answers;
  set: (p: Answers) => void;
  onPick: (a: Answers) => void;
  invalid: boolean;
  errorId: string;
}) {
  if (q.kind === 'single') {
    const value = answers[q.id] === undefined ? undefined : String(answers[q.id]);
    return (
      <div className="grid grid-cols-2 gap-3">
        {q.options.map((o) => (
          <label key={o.value} className={optionClass(value === o.value)}>
            <input
              type="radio"
              name={q.id}
              value={o.value}
              checked={value === o.value}
              onChange={() => set({ [q.id]: q.id === 'maxDailySteps' ? Number(o.value) : o.value } as Answers)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onPick({ ...answers, [q.id]: q.id === 'maxDailySteps' ? Number(o.value) : o.value } as Answers);
                }
              }}
              className="h-4 w-4 accent-foreground"
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }

  if (q.kind === 'priorities') {
    const chosen = answers.priorities ?? [];
    return (
      <div className="grid grid-cols-2 gap-3">
        {q.options.map((o) => {
          const rank = chosen.indexOf(o.value as never);
          const full = chosen.length >= 3 && rank < 0;
          return (
            <label key={o.value} className={cn(optionClass(rank >= 0), full && 'cursor-not-allowed opacity-50')}>
              <input
                type="checkbox"
                checked={rank >= 0}
                disabled={full}
                onChange={() =>
                  set({ priorities: rank >= 0 ? chosen.filter((c) => c !== o.value) : [...chosen, o.value as (typeof chosen)[number]] })
                }
                className="h-4 w-4 accent-foreground"
              />
              <span className="flex-1">{o.label}</span>
              {rank >= 0 && <span className="text-xs text-muted-foreground">{['1st', '2nd', '3rd'][rank]}</span>}
            </label>
          );
        })}
      </div>
    );
  }

  if (q.kind === 'allergens') {
    const chosen = answers.allergens ?? [];
    const toggle = (v: string) => set({ allergens: chosen.includes(v) ? chosen.filter((c) => c !== v) : [...chosen, v] });
    return (
      <div className="grid grid-cols-3 gap-2">
        {[...ALLERGEN_OPTIONS, { value: UNLISTED_ALLERGEN, label: 'Something not listed here' }].map((o) => (
          <label key={o.value} className={cn(optionClass(chosen.includes(o.value)), 'px-4 py-3 text-sm')}>
            <input type="checkbox" checked={chosen.includes(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 accent-foreground" />
            {o.label}
          </label>
        ))}
        {chosen.includes(UNLISTED_ALLERGEN) && (
          <p className="col-span-3 mt-2 text-sm text-muted-foreground">
            Because we cannot check for that ingredient, we will not suggest new products for you. We can still arrange what you already use.
          </p>
        )}
      </div>
    );
  }

  if (q.kind === 'budget') {
    return (
      <div className="max-w-xs">
        <label htmlFor="budget" className="text-sm font-medium">
          Budget in rupees
        </label>
        <div className="mt-2 flex items-center rounded-2xl border border-border px-4 focus-within:border-foreground">
          <span aria-hidden="true" className="text-muted-foreground">
            ₹
          </span>
          <input
            id="budget"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_BUDGET_RUPEES}
            step={1}
            value={answers.budgetRupees ?? ''}
            onChange={(e) => set({ budgetRupees: e.target.value === '' ? undefined : Number(e.target.value) })}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            className="w-full bg-transparent px-2 py-4 text-lg outline-none"
          />
        </div>
      </div>
    );
  }

  return <OwnedEditor items={answers.ownedItems ?? []} onChange={(ownedItems) => set({ ownedItems })} />;
}

const ROLE_LABELS: Record<OwnedDraft['role'], string> = {
  cleanse: 'Cleanser',
  moisturise: 'Moisturiser',
  protect: 'Sunscreen',
  other: 'Something else',
};

function OwnedEditor({ items, onChange }: { items: OwnedDraft[]; onChange: (items: OwnedDraft[]) => void }) {
  const update = (i: number, patch: Partial<OwnedDraft>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-[15px] text-muted-foreground">Nothing added. Continue if you are not using anything yet.</p>}
      {items.map((item, i) => (
        <div key={item.id} className="grid grid-cols-[1fr_12rem_auto_auto] items-end gap-3 rounded-2xl border border-border p-4">
          <label className="text-sm">
            <span className="font-medium">Product name</span>
            <input
              value={item.label}
              maxLength={80}
              onChange={(e) => update(i, { label: e.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Used as</span>
            <select
              value={item.role}
              onChange={(e) => update(i, { role: e.target.value as OwnedDraft['role'] })}
              className="mt-1 w-full rounded-xl border border-border bg-transparent px-3 py-2"
            >
              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={item.prescribed} onChange={(e) => update(i, { prescribed: e.target.checked })} className="h-4 w-4 accent-foreground" />
            Prescribed
          </label>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.label || 'this product'}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      {items.length < 20 && (
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-full"
          onClick={() => onChange([...items, { id: `owned-${Date.now().toString(36)}-${items.length}`, label: '', role: 'cleanse', prescribed: false }])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add a product
        </Button>
      )}
    </div>
  );
}
