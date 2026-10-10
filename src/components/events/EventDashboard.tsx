import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input, TextArea } from '../ui/Input';
import type { BazaarlyEvent, EventSale, InventoryItem } from '../../lib/types';

interface EventDashboardProps {
  event: BazaarlyEvent;
  upcomingEvents: BazaarlyEvent[];
  onClose: () => void;
  onMarkComplete: () => Promise<void>;
  onReturnInventory?: () => Promise<void>;
  onDeleteEvent: () => Promise<void>;
  onTransferInventory: (
    targetEventId: string | null,
    newEvent?: Pick<BazaarlyEvent, 'name' | 'date' | 'description' | 'vendorFee'>,
  ) => Promise<void>;
}

interface DashboardData {
  eventId: string;
  inventory: InventoryItem[];
  sales: EventSale[];
  error?: string;
}

export function EventDashboard({
  event,
  upcomingEvents,
  onClose,
  onMarkComplete,
  onReturnInventory,
  onDeleteEvent,
  onTransferInventory,
}: EventDashboardProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventVendorFee, setNewEventVendorFee] = useState('0');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const date = new Date(event.date);
  const isPast = event.status === 'past';
  const currentDashboard = dashboard?.eventId === event.id ? dashboard : null;
  const dataLoading = currentDashboard === null;

  useEffect(() => {
    let active = true;

    Promise.all([
      getDocs(query(collection(db, 'inventory'), where('eventId', '==', event.id))),
      getDocs(query(collection(db, 'sales'), where('eventId', '==', event.id))),
    ])
      .then(([inventorySnapshot, salesSnapshot]) => {
        if (!active) return;
        const inventory = inventorySnapshot.docs.map(snapshot => ({
          id: snapshot.id,
          ...snapshot.data(),
        } as InventoryItem));
        const sales = salesSnapshot.docs.map(snapshot => ({
          id: snapshot.id,
          ...snapshot.data(),
        } as EventSale));
        sales.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setDashboard({ eventId: event.id, inventory, sales });
      })
      .catch(error => {
        if (active) {
          setDashboard({
            eventId: event.id,
            inventory: [],
            sales: [],
            error: error instanceof Error ? error.message : 'Could not load the event dashboard.',
          });
        }
      });

    return () => { active = false; };
  }, [event.id, reloadCount]);

  const inventory = currentDashboard?.inventory ?? [];
  const sales = currentDashboard?.sales ?? [];
  const soldInventoryCount = inventory.filter(item => item.status === 'sold').length;
  const itemsSoldFromSales = sales.reduce((total, sale) => (
    total + (typeof sale.itemCount === 'number' ? sale.itemCount : Array.isArray(sale.items) ? sale.items.length : 0)
  ), 0);
  const itemsSold = Math.max(soldInventoryCount, itemsSoldFromSales);
  const availableInventoryCount = inventory.filter(item => item.status === 'approved').length;
  const transferableInventoryCount = inventory.filter(item => item.status !== 'sold').length;
  const sellThrough = inventory.length > 0 ? Math.min(100, Math.round((itemsSold / inventory.length) * 100)) : 0;
  const net = event.grossRevenue - event.vendorFee;
  const averageSale = sales.length > 0 ? event.grossRevenue / sales.length : 0;

  async function handleAction(key: string, fn: () => Promise<void>) {
    setLoadingAction(key);
    setActionError('');
    try {
      await fn();
      onClose();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The event action failed. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleTransfer() {
    setLoadingAction('transfer');
    setActionError('');
    try {
      if (transferTarget === '__new__') {
        if (!newEventVendorFee.trim()) {
          throw new Error('Enter a vendor fee for the new event.');
        }
        const vendorFee = Number(newEventVendorFee);
        if (!Number.isFinite(vendorFee) || vendorFee < 0) {
          throw new Error('Enter a valid vendor fee.');
        }
        await onTransferInventory(null, {
          name: newEventName,
          date: newEventDate,
          description: newEventDescription,
          vendorFee,
        });
      } else {
        await onTransferInventory(transferTarget || null);
      }
      setShowTransfer(false);
      setTransferTarget('');
      setNewEventName('');
      setNewEventDate('');
      setNewEventDescription('');
      setNewEventVendorFee('0');
      setReloadCount(count => count + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not transfer inventory.');
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <main style={{ flex: 1, background: 'var(--color-canvas)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'var(--space-xl) var(--space-xxl) var(--space-xxl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <header>
          <Button variant="tertiary" onClick={onClose} style={{ margin: '-8px 0 var(--space-sm)', paddingLeft: 0 }}>
            ← All events
          </Button>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
            <Badge variant={isPast ? 'past' : 'upcoming'} />
            <span style={{ fontSize: 'var(--text-body-sm)', opacity: 0.55 }}>
              {date.toLocaleString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
                year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
          <h1 style={{ margin: '0 0 var(--space-xs)', fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 540, lineHeight: 1.1, letterSpacing: '-0.7px' }}>
            {event.name}
          </h1>
          {event.description && (
            <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.65, lineHeight: 1.5 }}>
              {event.description}
            </p>
          )}
        </header>

        <section aria-label="Event finances">
          <SectionHeading>Finances · USD</SectionHeading>
          <div style={{ ...statPanelStyle, background: 'var(--color-block-lime)' }}>
            <Stat label="Gross revenue" value={money(event.grossRevenue)} />
            <Stat label="Vendor fee" value={money(event.vendorFee)} />
            <Stat label="Net" value={money(net)} color={net >= 0 ? 'var(--color-semantic-success)' : 'var(--color-accent-magenta)'} />
            <Stat label="Average sale" value={sales.length > 0 ? money(averageSale) : '—'} />
          </div>
          <p style={{ margin: 'var(--space-sm) 0 0', fontSize: 11, opacity: 0.5 }}>
            Net is gross revenue minus the vendor fee. Devnet test SOL is not converted to USD.
          </p>
        </section>

        <section aria-label="Event performance">
          <SectionHeading>Performance</SectionHeading>
          <div style={{ ...statPanelStyle, background: 'var(--color-block-cream)' }}>
            <Stat label="Sales" value={dataLoading ? '…' : String(sales.length)} />
            <Stat label="Items sold" value={dataLoading ? '…' : String(itemsSold)} />
            <Stat label="Available" value={dataLoading ? '…' : String(availableInventoryCount)} />
            <Stat label="Sell-through" value={dataLoading ? '…' : `${sellThrough}%`} />
          </div>
        </section>

        {currentDashboard?.error && (
          <div role="alert" style={{ color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}>
            Could not load dashboard details: {currentDashboard.error}
            <Button variant="tertiary" onClick={() => setReloadCount(value => value + 1)} style={{ marginLeft: 8 }}>
              Try again
            </Button>
          </div>
        )}

        <section aria-label="Event inventory">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
            <SectionHeading>Inventory</SectionHeading>
            <span style={{ fontSize: 'var(--text-body-sm)', opacity: 0.5 }}>
              {dataLoading ? 'Loading…' : `${inventory.length} assigned`}
            </span>
          </div>
          {dataLoading ? (
            <p role="status" style={{ margin: 0, padding: 'var(--space-lg)', textAlign: 'center', opacity: 0.55, background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-md)' }}>
              Loading event inventory…
            </p>
          ) : inventory.length === 0 ? (
            <p style={{ margin: 0, padding: 'var(--space-lg)', textAlign: 'center', opacity: 0.55, background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-md)' }}>
              No inventory is assigned to this event.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-md)' }}>
              {inventory.map(item => (
                <InventoryTile key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        <section aria-label="Recent sales">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
            <SectionHeading>Sales</SectionHeading>
            <span style={{ fontSize: 'var(--text-body-sm)', opacity: 0.5 }}>
              {dataLoading ? 'Loading…' : `${sales.length} transaction${sales.length === 1 ? '' : 's'}`}
            </span>
          </div>
          {dataLoading ? (
            <p role="status" style={{ margin: 0, padding: 'var(--space-lg)', textAlign: 'center', opacity: 0.55, background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-md)' }}>
              Loading sales…
            </p>
          ) : sales.length === 0 ? (
            <p style={{ margin: 0, padding: 'var(--space-lg)', textAlign: 'center', opacity: 0.55, background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-md)' }}>
              No confirmed sales recorded yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {sales.map(sale => <SaleRow key={sale.id} sale={sale} />)}
            </div>
          )}
        </section>

        <footer
          style={{
            display: 'flex',
            gap: 'var(--space-sm)',
            justifyContent: 'flex-end',
            borderTop: '1px solid var(--color-hairline-soft)',
            paddingTop: 'var(--space-lg)',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="magenta"
            onClick={() => setConfirmDelete(true)}
            disabled={loadingAction !== null}
            style={{ marginRight: 'auto' }}
          >
            Delete event
          </Button>
          {transferableInventoryCount > 0 && (
            <Button
              variant="secondary"
              onClick={() => setShowTransfer(true)}
              disabled={loadingAction !== null}
            >
              Transfer Inventory ({transferableInventoryCount})
            </Button>
          )}
          {!isPast && onReturnInventory && (
            <Button
              variant="secondary"
              onClick={() => handleAction('return', onReturnInventory)}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'return' ? 'Moving…' : 'Return All Inventory'}
            </Button>
          )}
          {!isPast && (
            <Button
              variant="primary"
              onClick={() => handleAction('complete', onMarkComplete)}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'complete' ? 'Marking…' : 'Mark Complete'}
            </Button>
          )}
          {isPast && <Button variant="secondary" onClick={onClose}>← All events</Button>}
        </footer>
      </div>
      {actionError && (
        <p role="alert" style={{ maxWidth: 1280, margin: '0 auto var(--space-lg)', padding: '0 var(--space-xxl)', color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}>
          {actionError}
        </p>
      )}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this event?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', lineHeight: 1.5 }}>
            Delete <strong>{event.name}</strong>? Unsold inventory will be unassigned and kept. Sold inventory and sales records will remain, and sales history will not be deleted. This cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={loadingAction !== null}>
              Cancel
            </Button>
            <Button
              variant="magenta"
              onClick={() => handleAction('delete', onDeleteEvent)}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'delete' ? 'Deleting…' : 'Delete event'}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer unsold inventory">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', lineHeight: 1.5 }}>
            Move {transferableInventoryCount} unsold {transferableInventoryCount === 1 ? 'item' : 'items'} from <strong>{event.name}</strong>. Sold inventory and sales history stay with this event.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-body-sm)', fontWeight: 480 }}>
            Destination event
            <select
              value={transferTarget}
              onChange={e => setTransferTarget(e.target.value)}
              style={{ padding: '12px 14px', border: '1.5px solid var(--color-hairline)', borderRadius: 'var(--radius-md)', background: 'var(--color-canvas)', color: 'var(--color-ink)', font: 'inherit' }}
            >
              <option value="">Choose an upcoming event</option>
              {upcomingEvents.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
              <option value="__new__">Create a new event…</option>
            </select>
          </label>
          {transferTarget === '__new__' && (
            <>
              <Input
                label="Event name"
                value={newEventName}
                onChange={e => setNewEventName(e.target.value)}
                required
              />
              <Input
                label="Date and time"
                type="datetime-local"
                value={newEventDate}
                onChange={e => setNewEventDate(e.target.value)}
                required
              />
              <TextArea
                label="Description"
                value={newEventDescription}
                onChange={e => setNewEventDescription(e.target.value)}
              />
              <Input
                label="Vendor fee ($)"
                type="number"
                min="0"
                step="0.01"
                value={newEventVendorFee}
                onChange={e => setNewEventVendorFee(e.target.value)}
                required
              />
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <Button variant="secondary" onClick={() => setShowTransfer(false)} disabled={loadingAction !== null}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleTransfer}
              disabled={loadingAction !== null || transferableInventoryCount === 0 || !transferTarget}
            >
              {loadingAction === 'transfer' ? 'Transferring…' : 'Transfer inventory'}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}

const statPanelStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 'var(--space-md)',
  padding: 'var(--space-lg)',
  borderRadius: 'var(--radius-lg)',
};

function InventoryTile({ item }: { item: InventoryItem }) {
  return (
    <article style={{ overflow: 'hidden', border: '1px solid var(--color-hairline-soft)', borderRadius: 'var(--radius-md)', background: 'var(--color-canvas)' }}>
      <div style={{ aspectRatio: '4 / 3', background: 'var(--color-surface-soft)' }}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title || 'Event inventory item'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', opacity: 0.35, fontSize: 12 }}>
            No image
          </div>
        )}
      </div>
      <div style={{ padding: 'var(--space-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-body-sm)' }}>
            {item.title || 'Untitled item'}
          </strong>
          <span style={{ flexShrink: 0, fontWeight: 700, fontSize: 'var(--text-body-sm)' }}>{money(item.price)}</span>
        </div>
        <div style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.55 }}>
          {item.status}
        </div>
      </div>
    </article>
  );
}

function SaleRow({ sale }: { sale: EventSale }) {
  const itemTitles = Array.isArray(sale.items) ? sale.items.map(item => item.title).filter(Boolean) : [];
  const saleDate = sale.createdAt ? new Date(sale.createdAt) : null;
  const signature = sale.payment?.signature || sale.id;

  return (
    <article style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap', padding: 'var(--space-md)', background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 'var(--text-body-sm)' }}>
          {typeof sale.itemCount === 'number' ? sale.itemCount : itemTitles.length} item
          {(typeof sale.itemCount === 'number' ? sale.itemCount : itemTitles.length) === 1 ? '' : 's'}
          {' · '}{money(sale.grossRevenue)}
        </strong>
        <div style={{ marginTop: 3, fontSize: 12, opacity: 0.6 }}>
          {saleDate && !Number.isNaN(saleDate.getTime()) ? saleDate.toLocaleString() : 'Date unavailable'}
          {itemTitles.length > 0 && ` · ${itemTitles.join(', ')}`}
        </div>
      </div>
      {signature && (
        <a
          href={`https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-ink)', overflowWrap: 'anywhere' }}
        >
          {signature.slice(0, 8)}…{signature.slice(-6)} ↗
        </a>
      )}
    </article>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 style={{ margin: '0 0 var(--space-sm)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.55 }}>
      {children}
    </h3>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-body-lg)', color }}>
        {value}
      </div>
    </div>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
