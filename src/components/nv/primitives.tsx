/**
 * Redesign primitives (Nuvē reference). Server components: no hooks, no
 * browser APIs, so public pages built from them stay static. Interactive
 * pieces (accordion, dialog, image fallback, menu) live in their own client
 * files. Values come from the measured tokens in globals.css and
 * tailwind.config.ts (`nv-*`).
 */
import * as React from 'react';
import Link from 'next/link';
import { Slot } from '@radix-ui/react-slot';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------- layout -- */

/** Content column: 40 px gutters at 1280, a centred 1240 px column from 1320 up (measured). */
export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[calc(var(--nv-container)+2*var(--nv-gutter))] px-nv-gutter', className)}
      {...props}
    />
  );
}

/** Full-bleed content: 40 px gutter at every width (hero, header, menu). */
export function Bleed({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full px-nv-gutter', className)} {...props} />;
}

/** A page section with the reference's vertical rhythm (100 / 150 / 200 px top and bottom). */
export function Section({
  space = 'md',
  tone = 'page',
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { space?: 'sm' | 'md' | 'lg'; tone?: 'page' | 'card' }) {
  return (
    <section
      className={cn(
        space === 'sm' ? 'py-[100px]' : space === 'md' ? 'py-[150px]' : 'py-[200px]',
        tone === 'card' ? 'bg-nv-card' : 'bg-nv-page',
        className
      )}
      {...props}
    />
  );
}

/** Measured two-column grid with 8 px gaps (Results cards). */
export function Grid({ cols = 2, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        'grid gap-nv-gap',
        cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4',
        className
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- type -- */

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4';
const HEADING_SIZE = {
  hero: 'text-nv-hero',
  display: 'text-nv-display',
  statement: 'text-nv-statement',
  title: 'text-nv-title',
  lead: 'text-nv-lead',
} as const;

/** Headings: semantic level and visual size are chosen separately. */
export function Heading({
  as: Tag = 'h2',
  size = 'display',
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: HeadingLevel; size?: keyof typeof HEADING_SIZE }) {
  return <Tag className={cn('text-balance font-medium', HEADING_SIZE[size], className)} {...props} />;
}

/** Second-tone words inside a heading or statement (#696666 on light, #ADADAD on dark). */
export function Muted({ onDark, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { onDark?: boolean }) {
  return <span className={cn(onDark ? 'text-nv-faint' : 'text-nv-muted', className)} {...props} />;
}

/** Small uppercase line above a hero or section (18 px, measured). */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-nv-body uppercase', className)} {...props} />;
}

export function Text({
  size = 'body',
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { size?: 'intro' | 'body' | 'label' | 'small' }) {
  const s = { intro: 'text-nv-intro', body: 'text-nv-body', label: 'text-nv-label', small: 'text-nv-small' }[size];
  return <p className={cn(s, 'text-nv-muted', className)} {...props} />;
}

/** The Avyora wordmark in the measured wordmark treatment. A link home. */
export function Wordmark({
  size = 'md',
  onDark,
  className,
}: {
  size?: 'md' | 'lg';
  onDark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={cn(
        'font-wordmark',
        size === 'md' ? 'text-nv-wordmark' : 'text-nv-wordmark-lg',
        onDark ? 'nv-focus-light text-white' : 'nv-focus text-nv-ink',
        className
      )}
    >
      Avyora
    </Link>
  );
}

/* ------------------------------------------------------------ actions -- */

const BUTTON = {
  base: 'nv-motion inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-nv-control ease-nv disabled:pointer-events-none disabled:opacity-50',
  variant: {
    dark: 'nv-focus bg-nv-ink text-white hover:bg-nv-accent',
    light: 'nv-focus-light bg-white text-nv-ink hover:bg-white/90',
    outline: 'nv-focus border border-nv-line bg-transparent text-nv-ink hover:border-nv-ink',
    ghost: 'nv-focus bg-transparent text-nv-ink hover:bg-nv-accent/5',
  },
  size: {
    /** 49 px pill: padding 14/24, label 16/20.8 (measured hero CTA, 155×49). */
    md: 'h-[49px] rounded-nv-pill px-6 text-nv-label',
    /** 60 px, radius 40: padding 18/24 (measured consultation button, 200×60). */
    lg: 'h-[60px] rounded-[40px] px-6 text-nv-label',
    /** 40 px circular icon button. */
    icon: 'h-10 w-10 rounded-full',
  },
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON.variant;
  size?: keyof typeof BUTTON.size;
  /** Renders the child (for example a Link) with button styling. */
  asChild?: boolean;
  /** Shows a spinner, keeps the width, and announces the busy state. */
  loading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'dark', size = 'md', asChild, loading, className, children, disabled, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(BUTTON.base, BUTTON.variant[variant], BUTTON.size[size], className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="h-4 w-4 animate-spin nv-motion" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  );
});

/** Text link with the reference's trailing arrow ("Ask a question →"). */
export function ArrowLink({ className, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cn('nv-focus group inline-flex items-center gap-2 text-nv-intro text-nv-ink', className)} {...props}>
      {children}
      <ArrowRight
        className="nv-motion h-5 w-5 transition-transform duration-nv-control ease-nv group-hover:translate-x-1"
        aria-hidden="true"
      />
    </a>
  );
}

/* -------------------------------------------------------------- cards -- */

/** White card, radius 18 (measured). `inset` adds the 32 px content padding of the reference cards. */
export function Card({
  inset = true,
  tone = 'card',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean; tone?: 'card' | 'page' }) {
  return (
    <div
      className={cn('rounded-nv-card', tone === 'card' ? 'bg-nv-card' : 'bg-nv-page', inset && 'p-8', className)}
      {...props}
    />
  );
}

/* ----------------------------------------------------- status, loading -- */

const STATUS = {
  info: { icon: Info, className: 'bg-nv-card text-nv-ink', role: 'status' as const },
  success: { icon: CheckCircle2, className: 'bg-nv-card text-nv-ink', role: 'status' as const },
  warning: { icon: AlertTriangle, className: 'bg-[#fff7e6] text-nv-ink', role: 'status' as const },
  error: { icon: AlertTriangle, className: 'bg-[#fdecea] text-nv-danger', role: 'alert' as const },
};

/**
 * A status line or panel. Errors use role="alert" (announced at once);
 * everything else role="status" (announced politely).
 */
export function StatusMessage({
  tone = 'info',
  title,
  action,
  className,
  children,
}: {
  tone?: keyof typeof STATUS;
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const { icon: Icon, className: toneClass, role } = STATUS[tone];
  return (
    <div
      role={role}
      className={cn('flex items-start gap-3 rounded-nv-inner px-5 py-4 text-nv-label', toneClass, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && (
          <div className={cn(title && 'text-nv-muted', tone === 'error' && 'text-nv-danger')}>{children}</div>
        )}
      </div>
      {action}
    </div>
  );
}

/** An inline busy indicator with a text label (never an unlabelled spinner). */
export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-nv-label text-nv-muted', className)}>
      <Loader2 className="nv-motion h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

/** A placeholder block of a fixed size, so content arriving later does not shift layout. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('nv-motion animate-pulse rounded-nv-inner bg-nv-line', className)} />;
}

/* ------------------------------------------------------------- motion -- */

/** Fades and slides children in as they scroll into view; CSS only, final state under reduced motion. */
export function Reveal({
  as: Tag = 'div',
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'li' }) {
  return <Tag className={cn('nv-reveal', className)} {...props} />;
}
