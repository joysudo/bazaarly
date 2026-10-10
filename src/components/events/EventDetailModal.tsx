import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { BazaarlyEvent } from '../../lib/types';

interface EventDetailModalProps {
  event: BazaarlyEvent;
  onClose: () => void;
  onMarkComplete: () => Promise<void>;
  onReturnInventory?: () => Promise<void>;
}

export function EventDetailModal({ event, onClose, onMarkComplete, onReturnInventory }: EventDetailModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const date = new Date(event.date);
  const isPast = event.status === 'past';
  const net = event.grossRevenue - event.vendorFee;
  const [salesState, setSalesState] = useState<{
    eventId: string;
    sales: number;
    items: number;
    error?: string;
  } | null>(null);
  const currentSalesState = salesState?.eventId === event.id ? salesState : null;
  const salesLoading = isPast && currentSalesState === null;

  useEffect(() => {
    if (!isPast) return;

    let active = true;

    getDocs(query(collection(db, 'sales'), where('eventId', '==', event.id)))
      .then(snapshot => {
        if (!active) return;
        const items = snapshot.docs.reduce((total, sale) => {
          const itemCount = sale.data().itemCount;
          return total + (typeof itemCount === 'number' ? itemCount : 0);
        }, 0);
        setSalesState({ eventId: event.id, sales: snapshot.size, items });
      })
      .catch(error => {
        if (active) {
          setSalesState({
            eventId: event.id,
            sales: 0,
            items: 0,
            error: error instanceof Error ? error.message : 'Could not load sales summary.',
          });
        }
      });

    return () => { active = false; };
  }, [event.id, isPast]);

  async function handleAction(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); onClose(); }
    finally { setLoading(null); }
  }

  return (
    <Modal open onClose={onClose} title={event.name}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <Badge variant={isPast ? 'past' : 'upcoming'} />
          <span style={{ fontSize: 'var(--text-body-sm)', opacity: 0.55 }}>
            {date.toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
              year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>

        {event.description && (
          <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.7, lineHeight: 1.5 }}>
            {event.description}
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-md)',
            background: 'var(--color-surface-soft)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
          }}
        >
          <Stat label="Vendor Fee" value={`$${event.vendorFee.toFixed(2)}`} />
          <Stat label="Gross" value={`$${event.grossRevenue.toFixed(2)}`} />
          <Stat
            label="Net"
            value={`$${net.toFixed(2)}`}
            color={net >= 0 ? 'var(--color-semantic-success)' : 'var(--color-accent-magenta)'}
          />
        </div>

        {isPast && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 'var(--space-md)',
              background: 'var(--color-surface-soft)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-md)',
            }}
          >
            {salesLoading ? (
              <p role="status" style={{ gridColumn: '1 / -1', margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.65 }}>
                Loading sales summary…
              </p>
            ) : currentSalesState?.error ? (
              <p role="alert" style={{ gridColumn: '1 / -1', margin: 0, color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}>
                {currentSalesState.error}
              </p>
            ) : (
              <>
                <Stat label="Sales" value={String(currentSalesState?.sales ?? 0)} />
                <Stat label="Items Sold" value={String(currentSalesState?.items ?? 0)} />
              </>
            )}
          </div>
        )}

        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 6 }}>
            Inventory
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.65 }}>
            {event.inventoryIds.length} item{event.inventoryIds.length !== 1 ? 's' : ''} assigned
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-sm)',
            justifyContent: 'flex-end',
            borderTop: '1px solid var(--color-hairline-soft)',
            paddingTop: 'var(--space-lg)',
            flexWrap: 'wrap',
          }}
        >
          {!isPast && onReturnInventory && (
            <Button
              variant="secondary"
              onClick={() => handleAction('return', onReturnInventory)}
              disabled={loading !== null}
            >
              {loading === 'return' ? 'Moving…' : 'Return All Inventory'}
            </Button>
          )}
          {!isPast && (
            <Button
              variant="primary"
              onClick={() => handleAction('complete', onMarkComplete)}
              disabled={loading !== null}
            >
              {loading === 'complete' ? 'Marking…' : 'Mark Complete'}
            </Button>
          )}
          {isPast && (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-body)', color }}>{value}</div>
    </div>
  );
}
