import { CloudSun, Droplets, Sun, Wind } from 'lucide-react';
import { conditionsForPincode } from '@/lib/environment';
import { guidanceFor, type Guidance } from '@/lib/routine-guidance';

/**
 * Today's conditions, and what they mean for a routine.
 *
 * Renders nothing at all when there is nothing worth saying — no PIN code, no
 * reading, or a perfectly ordinary day. A panel that appears every time saying
 * "conditions are fine" trains people to stop reading it, and then it is not
 * there on the day the UV index hits 11.
 *
 * Deliberately not a product recommendation. It advises on *sequencing and
 * protection*, which is useful whether or not anything gets bought — and a
 * weather widget that always concludes "so buy this" is an advertisement
 * wearing a lab coat.
 */
export async function ConditionsNotice({ postalCode }: { postalCode: string | null }) {
  if (!postalCode) return null;

  const conditions = await conditionsForPincode(postalCode);
  const notes = guidanceFor(conditions);

  if (notes.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center gap-2">
        <CloudSun className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Conditions in your area
        </h2>
      </header>

      <ul className="space-y-4">
        {notes.map((note) => (
          <li key={note.code} className="flex gap-3">
            <NoteIcon note={note} />
            <div>
              <p className="text-[14px] font-medium leading-snug">{note.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {note.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
        {/*
          Said plainly rather than buried. These are outdoor readings for a wide
          region, so they describe the weather where the order is going, not the
          air the customer is actually sitting in.
        */}
        Based on outdoor conditions across{' '}
        {conditions?.region.label ?? 'your region'}
        {conditions?.stale ? ', last updated over an hour ago' : ''}. Indoors will differ.
      </p>
    </section>
  );
}

function NoteIcon({ note }: { note: Guidance }) {
  const className =
    note.level === 'caution'
      ? 'mt-0.5 h-4 w-4 shrink-0 text-destructive'
      : 'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground';

  if (note.code === 'high_uv') return <Sun className={className} aria-hidden />;
  if (note.code === 'poor_air') return <Wind className={className} aria-hidden />;
  return <Droplets className={className} aria-hidden />;
}
