'use client';

import { useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AccordionItem = { id: string; question: string; answer: React.ReactNode };

/**
 * The reference FAQ: white rows, radius 18, 8 px apart, an ink circular
 * toggle (+ closed, − open), one item open at a time. Each question is a
 * real button with aria-expanded and aria-controls; the answer is a region
 * labelled by it. Height animates with CSS grid rows, and not at all under
 * reduced motion.
 */
export function Accordion({
  items,
  headingLevel: H = 'h3',
  defaultOpen = null,
}: {
  items: AccordionItem[];
  headingLevel?: 'h2' | 'h3' | 'h4';
  defaultOpen?: string | null;
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen);
  const base = useId();
  return (
    <div className="flex flex-col gap-nv-gap">
      {items.map((item) => {
        const expanded = open === item.id;
        const buttonId = `${base}-${item.id}-button`;
        const panelId = `${base}-${item.id}-panel`;
        return (
          <div key={item.id} className="rounded-nv-card bg-nv-card px-6">
            <H className="m-0">
              <button
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : item.id)}
                className="nv-focus flex w-full items-center justify-between gap-6 py-[24px] text-left text-nv-intro font-medium text-nv-ink"
              >
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nv-ink text-white"
                >
                  {expanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
              </button>
            </H>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!expanded}
              className={cn('nv-motion text-nv-body text-nv-muted', expanded && 'pb-6')}
            >
              <div className="max-w-[520px]">{item.answer}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
