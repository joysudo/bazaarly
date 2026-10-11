import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { buildAdviceContext, pickEvents } from '../../lib/adviceContext';
import type { AdviceContext, RawEventData } from '../../lib/adviceContext';
import type { BazaarlyEvent, InventoryItem } from '../../lib/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface AdviceChatProps {
  events: BazaarlyEvent[];
  /** The event the vendor is looking at. Leave unset on the events list. */
  focusEventId?: string | null;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

const FINANCE_API = (import.meta.env.VITE_FINANCE_API_URL as string | undefined) ?? 'http://localhost:3001';
const CONTEXT_TTL_MS = 60_000;

const STARTERS = [
  'What should I bring next time?',
  'Which items should I reprice?',
  'When were my best selling hours?',
  'How did this compare to my other events?',
];

// Lives outside the component: it talks to Firestore and the clock, and only runs from event handlers.
let cached: { key: string; at: number; context: AdviceContext } | null = null;

async function loadContext(events: BazaarlyEvent[], focusEventId: string | null): Promise<AdviceContext> {
  const chosen = pickEvents(events, focusEventId);
  const key = `${focusEventId ?? ''}|${chosen.map(event => event.id).join(',')}`;
  if (cached && cached.key === key && Date.now() - cached.at < CONTEXT_TTL_MS) return cached.context;

  const data: Record<string, RawEventData> = {};
  await Promise.all(chosen.map(async event => {
    const [inventorySnap, salesSnap] = await Promise.all([
      getDocs(query(collection(db, 'inventory'), where('eventId', '==', event.id))),
      getDocs(query(collection(db, 'sales'), where('eventId', '==', event.id))),
    ]);
    data[event.id] = {
      inventory: inventorySnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)),
      sales: salesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    };
  }));
  const context = buildAdviceContext(events, data, focusEventId);
  cached = { key, at: Date.now(), context };
  return context;
}

export function AdviceChat({ events, focusEventId = null }: AdviceChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  function scrollDown() {
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
  }

  async function ask(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || busy) return;
    setBusy(true);
    setError('');
    setDraft('');
    const history = messages;
    setMessages([...history, { role: 'user', content: question }]);
    scrollDown();

    try {
      const context = await loadContext(events, focusEventId);
      const res = await fetch(`${FINANCE_API}/api/advice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: history.slice(-6), context }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `The advice service returned ${res.status}.`);
      setMessages(current => [...current, { role: 'assistant', content: String(body.answer ?? '') }]);
    } catch (e) {
      const offline = e instanceof TypeError;
      setError(offline
        ? 'Could not reach the advice service. Start it with "node finance/server.js" and try again.'
        : e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  if (!open) {
    return (
      <Button
        variant="primary"
        onClick={() => setOpen(true)}
        aria-label="Open Ask Bazaarly"
        style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 150, boxShadow: '0 6px 24px rgba(0,0,0,0.2)' }}
      >
        ✦ Ask Bazaarly
      </Button>
    );
  }

  return (
    <section
      aria-label="Ask Bazaarly sales advisor"
      style={{
        position: 'fixed', right: 24, bottom: 24, zIndex: 150,
        width: 'min(400px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 48px))',
        background: 'var(--color-canvas)', border: '1.5px solid var(--color-hairline)',
        borderRadius: 'var(--radius-xl)', boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-hairline-soft)' }}>
        <strong style={{ fontWeight: 540 }}>✦ Ask Bazaarly</strong>
        <Button variant="icon" onClick={() => setOpen(false)} aria-label="Close" style={{ width: 32, height: 32, fontSize: 14 }}>✕</Button>
      </header>

      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <>
            <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.7, lineHeight: 1.5 }}>
              Ask about your sales, inventory and past events. Answers use only the data in your account.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STARTERS.map(text => (
                <Button
                  key={text}
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void ask(text)}
                  style={{ fontSize: 'var(--text-body-sm)', padding: '6px 12px', whiteSpace: 'normal', textAlign: 'left' }}
                >
                  {text}
                </Button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
              background: m.role === 'user' ? 'var(--color-primary)' : 'var(--color-surface-soft)',
              color: m.role === 'user' ? 'var(--color-on-primary)' : 'var(--color-ink)',
              fontSize: 'var(--text-body-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
            }}
          >
            {m.content}
          </div>
        ))}
        {busy && <p role="status" style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.55 }}>Thinking…</p>}
        {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-body-sm)', color: 'var(--color-accent-magenta)' }}>{error}</p>}
      </div>

      <form onSubmit={onSubmit} style={{ padding: 12, borderTop: '1px solid var(--color-hairline-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Input
              id="advice-question"
              value={draft}
              maxLength={500}
              placeholder="Ask about your sales…"
              onChange={e => setDraft(e.target.value)}
              aria-label="Your question"
            />
          </div>
          <Button type="submit" disabled={busy || !draft.trim()}>Send</Button>
        </div>
        <small style={{ opacity: 0.5, lineHeight: 1.4 }}>
          AI-generated from your event data. Payments are simulated (Solana Devnet and Nessie). Revenue is not profit.
        </small>
      </form>
    </section>
  );
}
