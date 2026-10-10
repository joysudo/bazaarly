import type { BazaarlyEvent } from '../../lib/types';
import { Badge } from '../ui/Badge';

interface EventCardProps {
  event: BazaarlyEvent;
  onOpen: () => void;
}

export function EventCard({ event, onOpen }: EventCardProps) {
  const date = new Date(event.date);
  const isPast = event.status === 'past';
  const net = event.grossRevenue - event.vendorFee;

  return (
    <div
      onClick={onOpen}
      style={{
        background: 'var(--color-canvas)',
        border: '1.5px solid var(--color-hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
        <Badge variant={isPast ? 'past' : 'upcoming'} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            opacity: 0.45,
          }}
        >
          {event.inventoryIds.length} items
        </span>
      </div>

      <h3 style={{ margin: '0 0 var(--space-xs)', fontSize: 'var(--text-card-title)', fontWeight: 700, lineHeight: 1.3 }}>
        {event.name}
      </h3>

      <p style={{ margin: '0 0 var(--space-sm)', fontSize: 'var(--text-body-sm)', opacity: 0.55 }}>
        {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
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
          display: 'flex',
          gap: 'var(--space-md)',
          borderTop: '1px solid var(--color-hairline-soft)',
          paddingTop: 'var(--space-md)',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 2 }}>
            Fee
          </div>
          <div style={{ fontWeight: 480, fontSize: 'var(--text-body-sm)' }}>${event.vendorFee.toFixed(2)}</div>
        </div>
        {isPast && (
          <>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 2 }}>
                Gross
              </div>
              <div style={{ fontWeight: 480, fontSize: 'var(--text-body-sm)' }}>${event.grossRevenue.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 2 }}>
                Net
              </div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)', color: net >= 0 ? 'var(--color-semantic-success)' : 'var(--color-accent-magenta)' }}>
                ${net.toFixed(2)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
