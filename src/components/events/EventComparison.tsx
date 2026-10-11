import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  averageOrderValue,
  completedEvents,
  eventSales,
  normalizeConfirmedSale,
  sumRevenue,
  sumUnits,
  type IntelligenceSale,
} from '../../lib/sellerAnalytics';
import type { BazaarlyEvent } from '../../lib/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import '../analytics/Analytics.css';

interface EventComparisonProps {
  events: BazaarlyEvent[];
  onClose: () => void;
}

export function EventComparison({ events, onClose }: EventComparisonProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sales, setSales] = useState<IntelligenceSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const pastEvents = useMemo(() => completedEvents(events), [events]);
  const selectedEvents = selectedIds.flatMap(id => {
    const event = pastEvents.find(candidate => candidate.id === id);
    return event ? [event] : [];
  });

  useEffect(() => {
    let active = true;
    getDocs(collection(db, 'sales'))
      .then(snapshot => {
        if (!active) return;
        setSales(snapshot.docs.flatMap(document => {
          const sale = normalizeConfirmedSale(document.id, document.data());
          return sale ? [sale] : [];
        }));
      })
      .catch(loadError => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load confirmed sales for comparison.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [retryToken]);

  function retry() {
    setLoading(true);
    setError('');
    setRetryToken(value => value + 1);
  }

  function toggleEvent(eventId: string) {
    setSelectedIds(current => current.includes(eventId)
      ? current.filter(id => id !== eventId)
      : current.length < 4 ? [...current, eventId] : current);
  }

  return (
    <Modal open onClose={onClose} title="Compare completed events" maxWidth={1080}>
      <div className="event-comparison">
        <p className="event-comparison-intro">
          Select up to four completed events. Metrics use confirmed USD sale records and the same definitions as each event report.
        </p>
        <div className="event-comparison-picker">
          {pastEvents.map(event => {
            const selected = selectedIds.includes(event.id);
            return (
              <label key={event.id} className="event-comparison-option">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && selectedIds.length >= 4}
                  onChange={() => toggleEvent(event.id)}
                />
                <span>
                  <strong>{event.name}</strong>
                  <small>{formatDate(event.date)}</small>
                </span>
              </label>
            );
          })}
        </div>
        <p className="event-comparison-count">{selectedIds.length}/4 selected · choose at least two to compare</p>

        {loading && <p role="status" className="analytics-empty-inline">Loading confirmed sales…</p>}
        {error && (
          <div className="event-comparison-error" role="alert">
            <span>Comparison data could not be loaded: {error}</span>
            <Button variant="tertiary" onClick={retry}>Try again</Button>
          </div>
        )}
        {!loading && !error && selectedEvents.length >= 2 && (
          <div className="event-comparison-grid">
            {selectedEvents.map(event => {
              const eventSaleRecords = eventSales(event.id, sales);
              const gross = sumRevenue(eventSaleRecords);
              const average = averageOrderValue(eventSaleRecords);
              const feeValid = Number.isFinite(event.vendorFee) && event.vendorFee >= 0;
              const rows = [
                ['Confirmed gross', gross === null ? 'Incomplete' : money(gross)],
                ['Orders', eventSaleRecords.length.toLocaleString()],
                ['Items sold', sumUnits(eventSaleRecords).toLocaleString()],
                ['Average order', average === null ? '—' : money(average)],
                ['After vendor fee', gross === null || !feeValid ? 'Unavailable' : money(gross - event.vendorFee)],
              ];
              return (
                <article className="event-comparison-card" key={event.id}>
                  <p className="analytics-eyebrow">{formatDate(event.date)}</p>
                  <h3>{event.name}</h3>
                  {rows.map(([label, value]) => (
                    <div className="event-comparison-metric" key={label}>
                      <span>{label}</span><strong>{value}</strong>
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        )}
        {!loading && !error && selectedEvents.length < 2 && (
          <p className="analytics-empty-inline">Choose at least two completed events to see them side by side.</p>
        )}
      </div>
    </Modal>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
