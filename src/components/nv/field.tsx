/**
 * Labelled form fields with linked help and error text. Server-safe: the
 * caller supplies a stable `id`, from which the help and error ids derive,
 * so `aria-describedby` always points at text that exists.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

type Common = {
  id: string;
  label: string;
  /** Shown under the label, linked with aria-describedby. */
  hint?: string;
  /** Shown under the field, linked and announced; marks the field invalid. */
  error?: string | null;
  className?: string;
};

const control = (invalid: boolean) =>
  cn(
    'nv-focus w-full rounded-nv-inner border bg-nv-card px-4 text-nv-label text-nv-ink placeholder:text-nv-faint',
    invalid ? 'border-nv-danger' : 'border-nv-line hover:border-nv-faint'
  );

function Wrap({ id, label, hint, error, className, children }: Common & { children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-nv-label text-nv-ink">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-nv-small text-nv-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-nv-small text-nv-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string | null) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

export function TextField({ id, label, hint, error, className, ...input }: Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'>) {
  return (
    <Wrap id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control(Boolean(error)), 'h-[52px]')}
        {...input}
      />
    </Wrap>
  );
}

export function TextAreaField({ id, label, hint, error, className, ...input }: Common & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>) {
  return (
    <Wrap id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control(Boolean(error)), 'min-h-[120px] py-3')}
        {...input}
      />
    </Wrap>
  );
}
