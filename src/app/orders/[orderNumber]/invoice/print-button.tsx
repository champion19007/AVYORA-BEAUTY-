'use client';

/**
 * Print the invoice.
 *
 * A client component only because `window.print()` needs one. The invoice is a
 * complete, valid document without this button — it is a convenience, not a
 * dependency, so nothing breaks if scripting is unavailable.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print mt-8 rounded-md border border-border px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors hover:border-primary hover:text-primary"
    >
      Print or save as PDF
    </button>
  );
}
