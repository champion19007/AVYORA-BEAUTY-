'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type Message = { role: 'user' | 'assistant'; content: string };

const MAX_CHARS = 1000;
const STARTERS = [
  'My skin gets oily by noon but my cheeks feel dry',
  'I keep getting small bumps on my forehead',
  'What is a simple routine for sensitive skin?',
];

/** Error bodies are `{ error: string }` or `{ error: { message } }` (limits); never render an object. */
function errorText(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return null;
}

/**
 * The conversation exists only in this component's state: closing or
 * reloading the tab clears it, and nothing is saved on the server.
 */
export function SkinChat() {
  const [agreed, setAgreed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim().slice(0, MAX_CHARS);
    if (!content || busy) return;
    setError(null);
    const history: Message[] = [...messages, { role: 'user', content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setDraft('');
    setBusy(true);
    abort.current = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        const message =
          res.status === 429
            ? 'You have sent a lot of messages. Please wait a little and try again.'
            : (errorText(body?.error) ?? 'The chat could not answer just now. Please try again.');
        setMessages(history);
        setError(message);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: 'assistant', content: reply }]);
      }
    } catch {
      if (!abort.current?.signal.aborted) {
        setMessages(history);
        setError('The connection dropped. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!agreed) {
    return (
      <div className="mt-10 rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium">Before you start</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>This is an AI guide, not a doctor. It cannot diagnose or prescribe.</li>
          <li>For anything painful, spreading, swollen, bleeding or near the eyes, see a doctor.</li>
          <li>
            Your messages are sent to our AI provider (Anthropic) to write a reply. We do not save the conversation; it
            disappears when you close this page.
          </li>
          <li>Please do not share your name, phone number, address or photos.</li>
        </ul>
        <Button className="mt-6" onClick={() => setAgreed(true)}>
          I understand, start chatting
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-10 flex flex-col rounded-lg border border-border">
      <div className="max-h-[60vh] min-h-[320px] space-y-4 overflow-y-auto p-6" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-muted-foreground">
              Describe what you are noticing about your skin. For example:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <p
              className={
                m.role === 'user'
                  ? 'max-w-[80%] whitespace-pre-wrap rounded-lg bg-foreground px-4 py-2.5 text-sm text-background'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-4 py-2.5 text-sm leading-relaxed'
              }
            >
              {m.content || (busy && i === messages.length - 1 ? 'Thinking…' : '')}
            </p>
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && (
        <p role="alert" className="border-t border-border px-6 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <form
        className="flex gap-3 border-t border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor="skin-chat-input" className="sr-only">
          Your message
        </label>
        <textarea
          id="skin-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={2}
          placeholder="Ask about your skin…"
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !draft.trim()}>
          {busy ? 'Replying…' : 'Send'}
        </Button>
      </form>
    </div>
  );
}
