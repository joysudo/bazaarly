import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection, addDoc, getDocs, doc, query, orderBy,
  writeBatch, arrayUnion, updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { mirrorItemImage } from '../lib/imageUtils';
import type { BazaarlyEvent, GarmentItem, InventoryItem, ApprovePayload } from '../lib/types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { InventoryCard } from '../components/inventory/InventoryCard';
import { UploadModal } from '../components/inventory/UploadModal';
import { ScanSessionModal } from '../components/inventory/ScanSessionModal';
import { ItemDetailModal } from '../components/inventory/ItemDetailModal';

type SortBy = 'newest' | 'oldest' | 'price-asc' | 'price-desc';

const STATUS_OPTIONS = [
  { value: 'approved', label: 'Available' },
  { value: 'sold',     label: 'Sold' },
  { value: 'discarded', label: 'Discarded' },
];

const PRICE_OPTIONS = [
  { value: 'under10', label: '< $10' },
  { value: '10-25',   label: '$10–25' },
  { value: '25-50',   label: '$25–50' },
  { value: '50plus',  label: '$50+' },
];

function matchScore(item: InventoryItem, q: string): 0 | 1 | 2 {
  if (item.title?.toLowerCase().includes(q)) return 2;
  if (item.searchText?.some(k => k.toLowerCase().includes(q))) return 1;
  return 0;
}

function priceInRange(price: number, range: string): boolean {
  switch (range) {
    case 'under10': return price < 10;
    case '10-25':   return price >= 10 && price <= 25;
    case '25-50':   return price >= 25 && price <= 50;
    case '50plus':  return price >= 50;
    default:        return true;
  }
}

export function InventoryPage() {
  const [items, setItems]   = useState<InventoryItem[]>([]);
  const [events, setEvents] = useState<BazaarlyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & sort
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('newest');

  // Multiselect filters
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [eventFilters,  setEventFilters]  = useState<Set<string>>(new Set());
  const [colorFilters,  setColorFilters]  = useState<Set<string>>(new Set());
  const [typeFilters,   setTypeFilters]   = useState<Set<string>>(new Set());
  const [priceFilter,   setPriceFilter]   = useState('');
  const [priceMin,      setPriceMin]      = useState('');
  const [priceMax,      setPriceMax]      = useState('');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [showUpload,  setShowUpload]  = useState(false);
  const [showScan,    setShowScan]    = useState(false);
  const [showAssign,  setShowAssign]  = useState(false);
  const [assignEventId, setAssignEventId] = useState('');
  const [assigning,   setAssigning]   = useState(false);
  const [detailItem,  setDetailItem]  = useState<InventoryItem | null>(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const [deleting,    setDeleting]    = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [itemsSnap, eventsSnap] = await Promise.all([
      getDocs(query(collection(db, 'inventory'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'events'),    orderBy('date', 'desc'))),
    ]);
    setItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
    setEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BazaarlyEvent)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived filter options ────────────────────────────────────────────────────

  const allTypes  = useMemo(() => [...new Set(items.map(i => i.garmentType).filter(Boolean) as string[])].sort(), [items]);
  const allColors = useMemo(() => [...new Set(items.flatMap(i => i.mainColors ?? []))].sort(), [items]);

  // ── Filtered + sorted items ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minVal = priceMin !== '' ? parseFloat(priceMin) : null;
    const maxVal = priceMax !== '' ? parseFloat(priceMax) : null;

    const base = items.filter(item => {
      if (statusFilters.size > 0 && !statusFilters.has(item.status)) return false;
      if (colorFilters.size  > 0 && !item.mainColors?.some(c => colorFilters.has(c))) return false;
      if (typeFilters.size   > 0 && !typeFilters.has(item.garmentType ?? '')) return false;
      if (eventFilters.size  > 0 && !eventFilters.has(item.eventId ?? 'unassigned')) return false;
      if (priceFilter && !priceInRange(item.price, priceFilter)) return false;
      if (!priceFilter) {
        if (minVal !== null && item.price < minVal) return false;
        if (maxVal !== null && item.price > maxVal) return false;
      }
      if (q && matchScore(item, q) === 0) return false;
      return true;
    });

    return [...base].sort((a, b) => {
      if (q) {
        const diff = matchScore(b, q) - matchScore(a, q);
        if (diff !== 0) return diff;
      }
      switch (sortBy) {
        case 'newest':    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'price-asc': return a.price - b.price;
        case 'price-desc':return b.price - a.price;
        default:          return 0;
      }
    });
  }, [items, search, sortBy, statusFilters, eventFilters, colorFilters, typeFilters, priceFilter, priceMin, priceMax]);

  const allSelected = filtered.length > 0 && filtered.every(i => selected.has(i.id));

  const hasActiveFilters =
    statusFilters.size > 0 || eventFilters.size > 0 ||
    colorFilters.size > 0 || typeFilters.size > 0 ||
    !!priceFilter || priceMin !== '' || priceMax !== '';

  const priceActiveCount = priceFilter ? 1 : (priceMin !== '' || priceMax !== '' ? 1 : 0);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleItemApproved(garmentItem: GarmentItem, payload: ApprovePayload) {
    const imageUrl = await mirrorItemImage(garmentItem.item_id);
    const docRef = await addDoc(collection(db, 'inventory'), {
      serviceItemId: garmentItem.item_id,
      price: payload.price,
      title: payload.title,
      status: 'approved',
      imageUrl,
      overview: garmentItem.descriptions?.overview ?? '',
      garmentType: payload.garmentType,
      mainColors: payload.mainColors,
      searchText: payload.searchText,
      artwork: payload.artwork,
      visionDetails: {
        schemaVersion: garmentItem.schema_version,
        fullDescription: garmentItem.descriptions?.full_description ?? '',
        sections: garmentItem.descriptions?.sections ?? {},
        notVisible: garmentItem.descriptions?.not_visible ?? [],
        ...(garmentItem.model_info ? {
          model: {
            name: garmentItem.model_info.vlm,
            promptVersion: garmentItem.model_info.prompt_version,
            latencySeconds: garmentItem.model_info.latency_s,
            inputTokens: garmentItem.model_info.input_tokens,
            outputTokens: garmentItem.model_info.output_tokens,
          },
        } : {}),
      },
      eventId: payload.eventId,
      createdAt: new Date().toISOString(),
    });
    if (payload.eventId) {
      await updateDoc(doc(db, 'events', payload.eventId), { inventoryIds: arrayUnion(docRef.id) });
    }
    await load();
  }

  async function handleBulkAssign() {
    if (!assignEventId || selected.size === 0) return;
    setAssigning(true);
    try {
      const batch = writeBatch(db);
      for (const itemId of selected) {
        batch.update(doc(db, 'inventory', itemId), { eventId: assignEventId });
      }
      batch.update(doc(db, 'events', assignEventId), {
        inventoryIds: arrayUnion(...Array.from(selected)),
      });
      await batch.commit();
      setSelected(new Set());
      setShowAssign(false);
      setAssignEventId('');
      await load();
    } finally {
      setAssigning(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTargetIds || deleting) return;
    setDeleting(true);
    try {
      const batch = writeBatch(db);
      for (const id of deleteTargetIds) batch.delete(doc(db, 'inventory', id));
      await batch.commit();
      setSelected(new Set());
      setDeleteTargetIds(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  function toggleFilter(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setter(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(i => i.id)));
    }
  }

  function clearFilters() {
    setStatusFilters(new Set());
    setEventFilters(new Set());
    setColorFilters(new Set());
    setTypeFilters(new Set());
    setPriceFilter('');
    setPriceMin('');
    setPriceMax('');
  }

  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const upcomingEvents = events.filter(e => e.status === 'upcoming');

  // ── Styles ────────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-sm)',
    background: 'var(--color-canvas)',
    color: 'var(--color-ink)',
    border: '1.5px solid var(--color-hairline)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px',
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    fontWeight: 320,
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main style={{ flex: 1 }}>
      {/* Header */}
      <div style={{ background: 'var(--color-block-lilac)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'var(--space-xxl)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-eyebrow)', fontWeight: 400, letterSpacing: '0.54px', textTransform: 'uppercase', marginBottom: 'var(--space-xs)' }}>Inventory</div>
            <h1 style={{ margin: 0, fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 340, lineHeight: 1.1, letterSpacing: '-0.96px' }}>
              Your items,<br />organised
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Button variant="secondary" onClick={() => setShowScan(true)}>📷 Begin Scan</Button>
            <Button variant="primary" onClick={() => setShowUpload(true)}>+ Upload Images</Button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'var(--space-xl) var(--space-xxl) var(--space-section)' }}>

        {/* Row 1: Search + Sort + Select all */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
            placeholder="Search by name or keyword…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            style={selectStyle}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
          </select>
          <button
            onClick={handleSelectAll}
            style={{
              background: '#111', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-md)', padding: '10px 16px',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)',
              fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        {/* Row 2: Filter dropdowns */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterDropdown label="Status" activeCount={statusFilters.size}>
            {STATUS_OPTIONS.map(o => (
              <DropdownOption
                key={o.value} label={o.label}
                active={statusFilters.has(o.value)}
                onClick={() => toggleFilter(setStatusFilters, o.value)}
              />
            ))}
          </FilterDropdown>

          <FilterDropdown label="Price" activeCount={priceActiveCount}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {PRICE_OPTIONS.map(o => (
                <MiniPill
                  key={o.value} label={o.label}
                  active={priceFilter === o.value}
                  onClick={() => { setPriceFilter(prev => prev === o.value ? '' : o.value); setPriceMin(''); setPriceMax(''); }}
                />
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: 10 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.4, marginBottom: 6 }}>Custom range</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number" placeholder="Min $" value={priceMin}
                  onChange={e => { setPriceMin(e.target.value); setPriceFilter(''); }}
                  style={{ width: 72, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-hairline)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none', background: 'var(--color-canvas)', color: 'var(--color-ink)' }}
                />
                <span style={{ opacity: 0.35, fontSize: 13 }}>–</span>
                <input
                  type="number" placeholder="Max $" value={priceMax}
                  onChange={e => { setPriceMax(e.target.value); setPriceFilter(''); }}
                  style={{ width: 72, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--color-hairline)', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none', background: 'var(--color-canvas)', color: 'var(--color-ink)' }}
                />
              </div>
            </div>
          </FilterDropdown>

          {allTypes.length > 0 && (
            <FilterDropdown label="Type" activeCount={typeFilters.size}>
              {allTypes.map(t => (
                <DropdownOption key={t} label={t} active={typeFilters.has(t)} onClick={() => toggleFilter(setTypeFilters, t)} />
              ))}
            </FilterDropdown>
          )}

          {allColors.length > 0 && (
            <FilterDropdown label="Color" activeCount={colorFilters.size}>
              {allColors.map(c => (
                <DropdownOption key={c} label={c} active={colorFilters.has(c)} onClick={() => toggleFilter(setColorFilters, c)} colorDot={c} />
              ))}
            </FilterDropdown>
          )}

          {events.length > 0 && (
            <FilterDropdown label="Event" activeCount={eventFilters.size}>
              <DropdownOption label="Unassigned" active={eventFilters.has('unassigned')} onClick={() => toggleFilter(setEventFilters, 'unassigned')} />
              {events.map(ev => (
                <DropdownOption key={ev.id} label={ev.name} active={eventFilters.has(ev.id)} onClick={() => toggleFilter(setEventFilters, ev.id)} />
              ))}
            </FilterDropdown>
          )}

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 13,
                color: 'var(--color-ink)', opacity: 0.45,
                padding: '4px 8px', borderRadius: 6,
                textDecoration: 'underline', textUnderlineOffset: 2,
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Row 3: Selection actions */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', alignItems: 'center' }}>
            <Button variant="magenta" onClick={() => setShowAssign(true)}>
              Assign {selected.size} to event →
            </Button>
            <Button
              variant="tertiary"
              onClick={() => setDeleteTargetIds([...selected])}
              style={{ color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}
            >
              🗑 Delete {selected.size}
            </Button>
            <button
              onClick={() => setSelected(new Set())}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)',
                color: 'var(--color-secondary)', padding: '4px 4px',
              }}
            >
              Deselect all
            </button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-section)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.35 }}>
            Loading inventory…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-section)', textAlign: 'center' }}>
            <p style={{ margin: 0, opacity: 0.5, fontSize: 'var(--text-body-sm)' }}>
              {items.length === 0 ? 'No items yet. Upload images to get started.' : 'No items match your filters.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-lg)' }}>
            {filtered.map(item => (
              <InventoryCard
                key={item.id}
                item={item}
                eventName={item.eventId ? eventById[item.eventId]?.name : undefined}
                selected={selected.has(item.id)}
                onSelect={e => toggleSelect(item.id, e)}
                onClick={() => setDetailItem(item)}
                onDelete={e => { e.stopPropagation(); setDeleteTargetIds([item.id]); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} events={events} onItemApproved={handleItemApproved} />

      <ScanSessionModal
        open={showScan}
        onClose={() => setShowScan(false)}
        events={events}
        onSessionComplete={() => { setShowScan(false); load(); }}
      />

      {/* Bulk assign */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title={`Assign ${selected.size} item${selected.size > 1 ? 's' : ''} to event`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {upcomingEvents.length === 0 ? (
            <p style={{ opacity: 0.6, fontSize: 'var(--text-body-sm)' }}>No upcoming events. Create one in the Events tab first.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                {upcomingEvents.map(event => (
                  <label key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', background: assignEventId === event.id ? 'var(--color-block-lime)' : 'var(--color-surface-soft)', cursor: 'pointer', transition: 'background 0.15s' }}>
                    <input type="radio" name="assign-event" value={event.id} checked={assignEventId === event.id} onChange={() => setAssignEventId(event.id)} />
                    <div>
                      <div style={{ fontWeight: 480, fontSize: 'var(--text-body-sm)' }}>{event.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.45, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        {new Date(event.date).toLocaleDateString()}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setShowAssign(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleBulkAssign} disabled={!assignEventId || assigning}>
                  {assigning ? 'Assigning…' : 'Assign'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={deleteTargetIds !== null} onClose={() => { if (!deleting) setDeleteTargetIds(null); }} title="Delete items?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.7, lineHeight: 1.6 }}>
            {deleteTargetIds?.length === 1
              ? 'This item will be permanently removed from your inventory.'
              : `${deleteTargetIds?.length} items will be permanently removed from your inventory.`}
            {' '}This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDeleteTargetIds(null)} disabled={deleting}>Cancel</Button>
            <Button variant="magenta" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : `Delete${deleteTargetIds && deleteTargetIds.length > 1 ? ` ${deleteTargetIds.length}` : ''}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Item detail */}
      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          events={events}
          onClose={() => setDetailItem(null)}
          onSaved={() => { setDetailItem(null); load(); }}
        />
      )}
    </main>
  );
}

// ── Filter dropdown ────────────────────────────────────────────────────────────

function FilterDropdown({ label, activeCount, children }: {
  label: string;
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const isActive = activeCount > 0;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 'var(--radius-pill)',
          border: `1.5px solid ${isActive ? 'var(--color-ink)' : 'var(--color-hairline)'}`,
          background: isActive ? 'var(--color-ink)' : 'transparent',
          color: isActive ? 'var(--color-inverse-ink)' : 'var(--color-ink)',
          fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 480,
          cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.4,
          transition: 'background 0.1s, border-color 0.1s, color 0.1s',
        }}
      >
        {label}{isActive ? ` · ${activeCount}` : ''}
        <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 1 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: 'var(--color-canvas)',
          border: '1.5px solid var(--color-hairline)',
          borderRadius: 'var(--radius-md)',
          padding: 8,
          minWidth: 180,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Dropdown option (checkbox row) ────────────────────────────────────────────

function DropdownOption({ label, active, onClick, colorDot }: {
  label: string;
  active: boolean;
  onClick: () => void;
  colorDot?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '5px 8px', borderRadius: 6,
        border: 'none', background: active ? 'var(--color-surface-soft)' : 'transparent',
        cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 480,
        color: 'var(--color-ink)', textAlign: 'left',
      }}
    >
      <span style={{
        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
        border: `1.5px solid ${active ? 'var(--color-ink)' : 'var(--color-hairline)'}`,
        background: active ? 'var(--color-ink)' : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {active && <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>}
      </span>
      {colorDot !== undefined && (
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: colorDot.replace(/\s+/g, ''), border: '1px solid rgba(0,0,0,0.12)' }} />
      )}
      {label}
    </button>
  );
}

// ── Mini pill (used inside price dropdown) ────────────────────────────────────

function MiniPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '3px 10px', borderRadius: 'var(--radius-pill)',
        border: `1.5px solid ${active ? 'var(--color-ink)' : 'var(--color-hairline)'}`,
        background: active ? 'var(--color-ink)' : 'transparent',
        color: active ? 'var(--color-inverse-ink)' : 'var(--color-ink)',
        fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 480,
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'background 0.1s, border-color 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  );
}
