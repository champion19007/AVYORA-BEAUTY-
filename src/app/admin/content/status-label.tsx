import type { documentsOfType } from '@/modules/cms/content-read';

export type Doc = Awaited<ReturnType<typeof documentsOfType>>[number];

/** Where one piece of content stands, in the words an editor would use. */
export function StatusLabel({ doc }: { doc: Doc | null }) {
  const [text, tone] = !doc
    ? ['Catalogue text', 'text-muted-foreground']
    : doc.status !== 'published'
      ? ['Draft', 'text-amber-700 dark:text-amber-400']
      : doc.publishedVersion !== doc.version
        ? ['Live · unpublished changes', 'text-amber-700 dark:text-amber-400']
        : ['Live', 'text-emerald-700 dark:text-emerald-400'];
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${tone}`}>{text}</span>
  );
}
