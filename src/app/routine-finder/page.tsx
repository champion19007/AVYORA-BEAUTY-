'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { persistRoutine } from './actions';
import { QuizView } from './quiz-view';
import { ResultsView } from './results-view';
import { toProfile, type Answers } from './quiz';
import { RoutineSession } from './routine-session';

/** Face scanning is optional and not built yet; its entry point stays hidden unless this flag is set. */
const FACE_SCAN_ENABLED = process.env.NEXT_PUBLIC_FACE_SCAN === '1';

type Stage = 'intro' | 'quiz' | 'results';
type SavedSummary = { id: string; createdAt: string; expiresAt: string; validity: 'current' | 'outdated' | 'revoked' };

const savedParam = () => new URLSearchParams(window.location.search).get('saved');
function setSavedParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('saved', id);
  else url.searchParams.delete('saved');
  window.history.replaceState(null, '', url);
}

export default function RoutineFinderPage() {
  const [session] = useState(() => new RoutineSession());
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const [stage, setStage] = useState<Stage>('intro');
  const [answers, setAnswers] = useState<Answers>({});

  // Reload: a saved routine in the address bar is fetched again (owner only).
  useEffect(() => {
    const id = savedParam();
    if (id) void session.loadSaved(id);
  }, [session]);

  // Keep the address bar pointing at the saved routine, so a reload returns to it.
  const savedId = state.save.status === 'saved' ? state.save.id : null;
  useEffect(() => {
    if (stage === 'results' && savedId) setSavedParam(savedId);
  }, [stage, savedId]);

  useEffect(() => {
    if (state.savedUnavailable) setSavedParam(null);
  }, [state.savedUnavailable]);

  const finish = (a: Answers) => {
    const built = toProfile(a);
    if (!built.ok) return;
    setStage('results');
    setSavedParam(null);
    void session.compute(built.profile);
    void persistRoutine({ skinType: built.profile.skinType, concern: built.profile.priorities[0] ?? 'none' });
  };

  if (stage === 'quiz') {
    return <QuizView answers={answers} onChange={setAnswers} onFinish={finish} onExit={() => setStage('intro')} />;
  }
  // Results also show while a saved routine from the address bar loads or is open.
  const showResults = (stage === 'results' || state.phase !== 'idle') && !state.savedUnavailable;
  if (showResults) {
    return (
      <ResultsView
        state={state}
        session={session}
        onEdit={() => {
          setSavedParam(null);
          setStage('quiz');
        }}
        onRestart={() => {
          session.reset();
          setSavedParam(null);
          setAnswers({});
          setStage('intro');
        }}
      />
    );
  }
  return (
    <Intro
      unavailable={state.savedUnavailable}
      onStart={() => setStage('quiz')}
      onOpen={(id) => {
        setStage('results');
        setSavedParam(id);
        void session.loadSaved(id);
      }}
    />
  );
}

function Intro({ unavailable, onStart, onOpen }: { unavailable: boolean; onStart: () => void; onOpen: (id: string) => void }) {
  const [saved, setSaved] = useState<SavedSummary[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/routines', { signal: controller.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { routines: [] }))
      .then((b: { routines: SavedSummary[] }) => setSaved(b.routines))
      .catch(() => setSaved([]));
    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Routine finder</p>
      <h1 className="mt-4 max-w-3xl font-headline text-6xl font-normal leading-[1.05] tracking-tight">
        A routine you can keep, at a price you choose
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
        Fifteen short questions. We build a real week of morning and evening steps, use what you already own, and explain everything we leave out.
      </p>

      {unavailable && (
        <div role="alert" className="mt-8 max-w-2xl rounded-2xl bg-primary/10 px-5 py-4 text-[15px]">
          That saved routine is no longer available. Saved routines expire (30 days without an account, 180 with one), and are removed if they are deleted or
          you withdraw permission to keep them. They can only be opened from the browser or account that saved them.
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Button onClick={onStart} className="gap-2 rounded-full px-8 py-6 text-base">
          Start the questions <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        {FACE_SCAN_ENABLED && (
          <Button asChild variant="outline" className="rounded-full px-8 py-6 text-base">
            <Link href="/scan">Add an optional face scan</Link>
          </Button>
        )}
      </div>

      {saved && saved.length > 0 && (
        <section className="mt-16 border-t border-border pt-10" aria-labelledby="saved-heading">
          <h2 id="saved-heading" className="font-headline text-3xl font-normal tracking-tight">
            Your saved routines
          </h2>
          <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
            {saved.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="font-medium">Saved {new Date(r.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.validity === 'current' ? 'Up to date' : r.validity === 'outdated' ? 'Guidance updated since; can be recalculated' : 'No longer valid; can be recalculated'}
                    {' · '}kept until {new Date(r.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </p>
                </div>
                <Button variant="outline" className="rounded-full" onClick={() => onOpen(r.id)}>
                  Open<span className="sr-only"> routine saved {new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
