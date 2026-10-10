import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, addDoc, deleteDoc, getDocs, doc, updateDoc, query, where, orderBy, writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { BazaarlyEvent } from '../lib/types';
import { Button } from '../components/ui/Button';
import { EventCard } from '../components/events/EventCard';
import { CreateEventModal } from '../components/events/CreateEventModal';
import { EventDashboard } from '../components/events/EventDashboard';

type EventDraft = Omit<BazaarlyEvent, 'id' | 'createdAt' | 'inventoryIds' | 'grossRevenue' | 'status'>;

interface EventsPageProps {
  selectedEvent: BazaarlyEvent | null;
  onSelectEvent: (event: BazaarlyEvent) => void;
  onCloseDashboard: () => void;
}

export function EventsPage({ selectedEvent, onSelectEvent, onCloseDashboard }: EventsPageProps) {
  const [events, setEvents] = useState<BazaarlyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadEvents = useCallback(async () => {
    const q = query(collection(db, 'events'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as BazaarlyEvent)));
    setLoading(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  async function handleCreate(draft: EventDraft) {
    const isPast = new Date(draft.date) < new Date();
    await addDoc(collection(db, 'events'), {
      ...draft,
      status: isPast ? 'past' : 'upcoming',
      inventoryIds: [],
      grossRevenue: 0,
      createdAt: new Date().toISOString(),
    });
    await loadEvents();
  }

  async function handleMarkComplete(event: BazaarlyEvent) {
    await updateDoc(doc(db, 'events', event.id), { status: 'past' });
    await loadEvents();
  }

  async function handleReturnInventory(event: BazaarlyEvent) {
    const batch = writeBatch(db);
    for (const itemId of event.inventoryIds) {
      batch.update(doc(db, 'inventory', itemId), { eventId: null });
    }
    batch.update(doc(db, 'events', event.id), { inventoryIds: [] });
    await batch.commit();
    await loadEvents();
  }

  async function handleDeleteEvent(event: BazaarlyEvent) {
    const inventorySnapshot = await getDocs(query(
      collection(db, 'inventory'),
      where('eventId', '==', event.id),
    ));
    const unsoldItems = inventorySnapshot.docs.filter(item => item.data().status !== 'sold');
    const chunkSize = 450;

    for (let start = 0; start < unsoldItems.length; start += chunkSize) {
      const batch = writeBatch(db);
      unsoldItems.slice(start, start + chunkSize).forEach(item => {
        batch.update(item.ref, { eventId: null });
      });
      await batch.commit();
    }

    await deleteDoc(doc(db, 'events', event.id));
    await loadEvents();
  }

  const upcoming = events.filter(e => e.status === 'upcoming');
  const past = events.filter(e => e.status === 'past');

  if (selectedEvent) {
    return (
      <EventDashboard
        event={events.find(event => event.id === selectedEvent.id) ?? selectedEvent}
        onClose={onCloseDashboard}
        onMarkComplete={() => handleMarkComplete(selectedEvent)}
        onReturnInventory={selectedEvent.inventoryIds.length > 0 ? () => handleReturnInventory(selectedEvent) : undefined}
        onDeleteEvent={() => handleDeleteEvent(selectedEvent)}
      />
    );
  }

  return (
    <main style={{ flex: 1 }}>
      {/* Hero color block */}
      <div style={{ background: 'var(--color-block-lime)' }}>
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: 'var(--space-xxl) var(--space-xxl)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-md)',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-eyebrow)',
                fontWeight: 400,
                letterSpacing: '0.54px',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-sm)',
              }}
            >
              Events
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(40px, 5vw, 64px)',
                fontWeight: 340,
                lineHeight: 1.1,
                letterSpacing: '-0.96px',
              }}
            >
              Your pop-up<br />calendar
            </h1>
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + Create Event
          </Button>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 'var(--space-section) var(--space-xxl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-section)',
        }}
      >
        {loading ? (
          <Mono>Loading events…</Mono>
        ) : (
          <>
            <section>
              <Eyebrow>Upcoming — {upcoming.length}</Eyebrow>
              {upcoming.length === 0 ? (
                <EmptyState>No upcoming events. Create one to get started.</EmptyState>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 'var(--space-lg)',
                    marginTop: 'var(--space-lg)',
                  }}
                >
                  {upcoming.map(event => (
                    <EventCard key={event.id} event={event} onOpen={() => onSelectEvent(event)} />
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section>
                <Eyebrow>Past — {past.length}</Eyebrow>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 'var(--space-lg)',
                    marginTop: 'var(--space-lg)',
                  }}
                >
                  {past.map(event => (
                    <EventCard key={event.id} event={event} onOpen={() => onSelectEvent(event)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <CreateEventModal open={showCreate} onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
    </main>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-eyebrow)',
        fontWeight: 400,
        letterSpacing: '0.54px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-soft)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-xxl)',
        textAlign: 'center',
        marginTop: 'var(--space-lg)',
      }}
    >
      <p style={{ margin: 0, opacity: 0.5, fontSize: 'var(--text-body-sm)' }}>{children}</p>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 'var(--space-section)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-caption)',
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        opacity: 0.35,
      }}
    >
      {children}
    </div>
  );
}
