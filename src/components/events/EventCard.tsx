import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { BazaarlyEvent } from '../../lib/types';
import { Badge } from '../ui/Badge';

interface EventCardProps {
  event: BazaarlyEvent;
  onOpen: () => void;
}

interface SalesSummary {
  eventId: string;
  sales: number;
  items: number;
  error: boolean;
}

export function EventCard({ event, onOpen }: EventCardProps) {
  const date = new Date(event.date);
  const isPast = event.status === 'past';
  const net = event.grossRevenue - event.vendorFee;
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const currentSummary = salesSummary?.eventId === event.id ? salesSummary : null;

  useEffect(() => {
    let active = true;
    getDocs(query(collection(db, 'sales'), where('eventId', '==', event.id)))
      .then(snapshot => {
        if (!active) return;
        const items = snapshot.docs.reduce((total, sale) => {
          const saleData = sale.data();
          const itemCount = saleData.itemCount;
          return total + (typeof itemCount === 'number'
            ? itemCount
            : Array.isArray(saleData.items) ? saleData.items.length : 0);
        }, 0);
        setSalesSummary({ eventId: event.id, sales: snapshot.size, items, error: false });
      })
      .catch(() => {
        if (active) setSalesSummary({ eventId: event.id, sales: 0, items: 0, error: true });
      });
    return () => { active = false; };
  }, [event.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        background: 'var(--color-canvas)',
        border: '1.5px solid var(--color-hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
        <Badge variant={isPast ? 'past' : 'upcoming'} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.45 }}>
          {event.inventoryIds.length} assigned
        </span>
      </div>

      <h3 style={{ margin: '0 0 var(--space-xs)', fontSize: 'var(--text-card-title)', fontWeight: 700, lineHeight: 1.3 }}>
        {event.name}
      </h3>

      <p style={{ margin: '0 0 var(--space-sm)', fontSize: 'var(--text-body-sm)', opacity: 0.55 }}>
        {date.toLocaleString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
          year: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </p>

      {event.description && (
        <p
          style={{
            margin: '0 0 var(--space-md)',
            fontSize: 'var(--text-body-sm)',
            opacity: 0.6,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
          }}
        >
          {event.description}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 'var(--space-md) var(--space-sm)',
          borderTop: '1px solid var(--color-hairline-soft)',
          paddingTop: 'var(--space-md)',
        }}
      >
        <TileStat label="Vendor fee" value={money(event.vendorFee)} />
        <TileStat label="Gross" value={money(event.grossRevenue)} />
        <TileStat label="Net" value={money(net)} color={net >= 0 ? 'var(--color-semantic-success)' : 'var(--color-accent-magenta)'} />
        <TileStat label="Sales" value={salesLabel(currentSummary)} />
        <TileStat label="Items sold" value={currentSummary?.error ? '—' : currentSummary ? String(currentSummary.items) : '…'} />
        <TileStat label="Inventory" value={`${event.inventoryIds.length} items`} />
      </div>

      <div style={{ marginTop: 'var(--space-md)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.45px', textTransform: 'uppercase', opacity: 0.35 }}>
        Open event dashboard →
      </div>
    </div>
  );
}

function salesLabel(summary: SalesSummary | null): string {
  if (summary?.error) return '—';
  return summary ? String(summary.sales) : '…';
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function TileStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontWeight: 650, fontSize: 'var(--text-body-sm)', color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}
