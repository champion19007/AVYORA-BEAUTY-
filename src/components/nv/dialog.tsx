'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A modal dialog in the redesign's style. Radix provides the behaviour the
 * specification requires: focus moves in and is trapped, Escape and the
 * close button dismiss it, focus returns to the trigger, and the rest of the
 * page is hidden from assistive technology while it is open.
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  className,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="nv-motion fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <RadixDialog.Content
          className={cn(
            'nv-motion fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-80px))] max-h-[calc(100vh-80px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-nv-card bg-nv-card p-8 font-nv text-nv-ink shadow-xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95',
            className
          )}
        >
          <div className="flex items-start justify-between gap-6">
            <RadixDialog.Title className="text-nv-title">{title}</RadixDialog.Title>
            <RadixDialog.Close className="nv-focus -mr-2 -mt-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-nv-accent/5" aria-label="Close">
              <X className="h-5 w-5" aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="mt-2 text-nv-body text-nv-muted">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="mt-6">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
