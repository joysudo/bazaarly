import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, addDoc, getDocs, doc, query, orderBy, writeBatch, arrayUnion, updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import type { BazaarlyEvent, GarmentItem, InventoryItem, ApprovePayload } from '../lib/types';
import { getItemImageUrl } from '../lib/garmentVision';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { InventoryCard } from '../components/inventory/InventoryCard';
import { UploadModal } from '../components/inventory/UploadModal';
import { ScanPlaceholder } from '../components/inventory/ScanPlaceholder';
import { ItemDetailModal } from '../components/inventory/ItemDetailModal';

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [events, setEvents] = useState<BazaarlyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignEventId, setAssignEventId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);

  const load = useCallback(async () => {
    const [itemsSnap, eventsSnap] = await Promise.all([
      getDocs(query(collection(db, 'inventory'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'events'), orderBy('date', 'desc'))),
    ]);
    setItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
    setEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BazaarlyEvent)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function mirrorImage(serviceItemId: string): Promise<string> {
    const sourceUrl = getItemImageUrl(serviceItemId);
    try {
      const res = await fetch(sourceUrl);
      if (!res.ok) return sourceUrl;
      const blob = await res.blob();
      const storageRef = ref(storage, `inventory/${serviceItemId}/image.jpg`);
      await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
      return getDownloadURL(storageRef);
    } catch {
      return sourceUrl;
    }
  }

  async function handleItemApproved(garmentItem: GarmentItem, payload: ApprovePayload) {
    const imageUrl = await mirrorImage(garmentItem.item_id);
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
      eventId: payload.eventId,
      createdAt: new Date().toISOString(),
    });

    // If an event was selected at approval time, update that event's inventory list
    if (payload.eventId) {
      await updateDoc(doc(db, 'events', payload.eventId), {
        inventoryIds: arrayUnion(docRef.id),
      });
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

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  const filtered = items.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (eventFilter !== 'all') {
      if (eventFilter === 'unassigned' && item.eventId) return false;
      if (eventFilter !== 'unassigned' && item.eventId !== eventFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        item.title?.toLowerCase().includes(q) ||
        item.overview?.toLowerCase().includes(q) ||
        item.garmentType?.toLowerCase().includes(q) ||
        item.searchText?.some(k => k.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const upcomingEvents = events.filter(e => e.status === 'upcoming');

  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-sm)',
    fontWeight: 320,
    background: 'var(--color-canvas)',
    color: 'var(--color-ink)',
    border: '1.5px solid var(--color-hairline)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    outline: 'none',
    cursor: 'pointer',
  };

  return (
    <main style={{ flex: 1 }}>
      {/* Header block */}
      <div style={{ background: 'var(--color-block-lilac)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'var(--space-xxl)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-eyebrow)', fontWeight: 400, letterSpacing: '0.54px', textTransform: 'uppercase', marginBottom: 'var(--space-sm)' }}>
              Inventory
            </div>
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
        {/* Filters */}
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...selectStyle, maxWidth: 280, borderRadius: 'var(--radius-md)', padding: '10px 14px', flexGrow: 1 }}
            placeholder="Search inventory…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            <option value="approved">Available</option>
            <option value="sold">Sold</option>
            <option value="discarded">Discarded</option>
          </select>
          <select style={selectStyle} value={eventFilter} onChange={e => setEventFilter(e.target.value)}>
            <option value="all">All events</option>
            <option value="unassigned">Unassigned</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {selected.size > 0 && (
            <Button variant="magenta" onClick={() => setShowAssign(true)}>
              Assign {selected.size} to event →
            </Button>
          )}
        </div>

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
              />
            ))}
          </div>
        )}
      </div>

      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        events={events}
        onItemApproved={handleItemApproved}
      />

      <ScanPlaceholder open={showScan} onClose={() => setShowScan(false)} />

      {/* Bulk assign modal */}
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

      {/* Item detail / edit modal */}
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
