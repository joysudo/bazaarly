import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { patchItem } from '../../lib/garmentVision';
import type { InventoryItem, BazaarlyEvent } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface ItemDetailModalProps {
  item: InventoryItem;
  events: BazaarlyEvent[];
  onClose: () => void;
  onSaved: () => void;
}

export function ItemDetailModal({ item, events, onClose, onSaved }: ItemDetailModalProps) {
  const isSold = item.status === 'sold';

  const [title, setTitle] = useState(item.title);
  const [price, setPrice] = useState(String(item.price));
  const [garmentType, setGarmentType] = useState(item.garmentType ?? '');
  const [colors, setColors] = useState<string[]>(item.mainColors ?? []);
  const [keywords, setKeywords] = useState<string[]>(item.searchText ?? []);
  const [eventId, setEventId] = useState<string | null>(item.eventId ?? null);
  const [colorInput, setColorInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function addColor() {
    const v = colorInput.trim().toLowerCase();
    if (v && !colors.includes(v)) setColors(prev => [...prev, v]);
    setColorInput('');
  }

  function addKeyword() {
    const v = keywordInput.trim().toLowerCase();
    if (v && !keywords.includes(v)) setKeywords(prev => [...prev, v]);
    setKeywordInput('');
  }

  async function handleSave() {
    const parsedPrice = Number(price);
    if (!price.trim() || !Number.isFinite(parsedPrice) || Math.round(parsedPrice * 100) <= 0) {
      setError('Enter a price of at least $0.01 before saving this item.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const update: Partial<InventoryItem> = {
        title: title.trim() || 'Untitled',
        price: parsedPrice,
        garmentType: garmentType.trim(),
        mainColors: colors,
        searchText: keywords,
        eventId,
      };
      await updateDoc(doc(db, 'inventory', item.id), update);
      // Best-effort sync to Garment Vision (non-blocking on failure)
      if (item.serviceItemId) {
        patchItem(item.serviceItemId, {
          descriptions: {
            short_title: update.title,
            price: update.price != null ? `$${(update.price as number).toFixed(2)}` : undefined,
            garment_type: update.garmentType,
            main_colors: update.mainColors,
            search_text: update.searchText,
          } as never,
        }).catch(() => {});
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="" maxWidth={640}>
      <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
        {/* Image */}
        <div style={{ flexShrink: 0, width: 200, height: 200, borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface-soft)' }}>
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: isSold ? 'grayscale(0.6)' : 'none' }}
            />
          )}
        </div>

        {/* Fields */}
        <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {/* Name + overview */}
          <div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={isSold}
              placeholder="Item name…"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-card-title)', fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-ink)', width: '100%', padding: 0, lineHeight: 1.3, opacity: isSold ? 0.5 : 1 }}
            />
            {item.overview && (
              <p style={{ margin: '2px 0 0', fontSize: 'var(--text-body-sm)', opacity: 0.5, lineHeight: 1.45, fontStyle: 'italic' }}>
                {item.overview.slice(0, 180)}{item.overview.length > 180 ? '…' : ''}
              </p>
            )}
          </div>

          <div style={{ height: 1, background: 'var(--color-hairline-soft)' }} />

          {/* Price · Type · Event */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 100px' }}>
              <Input label="Price ($)" id="detail-price" type="number" min="0.01" step="0.01" value={price} onChange={e => { setPrice(e.target.value); setError(''); }} disabled={isSold} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <Input label="Garment Type" id="detail-type" value={garmentType} onChange={e => setGarmentType(e.target.value)} placeholder="T-shirt, jacket…" disabled={isSold} />
            </div>
          </div>

          {/* Event dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-body-sm)', fontWeight: 480, letterSpacing: '-0.14px', marginBottom: 6 }}>Event</label>
            <select
              value={eventId ?? ''}
              onChange={e => setEventId(e.target.value || null)}
              disabled={isSold}
              style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', background: 'var(--color-canvas)', color: 'var(--color-ink)', border: '1.5px solid var(--color-hairline)', borderRadius: 'var(--radius-md)', padding: '10px 12px', width: '100%', outline: 'none', cursor: isSold ? 'default' : 'pointer' }}
            >
              <option value="">Unassigned</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>

          {/* Colors */}
          {!isSold ? (
            <EditableTagField label="Colors" tags={colors} input={colorInput} onInputChange={setColorInput} onAdd={addColor} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addColor(); } }} onRemove={c => setColors(prev => prev.filter(x => x !== c))} colorDot />
          ) : colors.length > 0 ? (
            <ReadTagField label="Colors" tags={colors} colorDot />
          ) : null}

          {/* Keywords */}
          {!isSold ? (
            <EditableTagField label="Keywords" tags={keywords} input={keywordInput} onInputChange={setKeywordInput} onAdd={addKeyword} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(); } }} onRemove={k => setKeywords(prev => prev.filter(x => x !== k))} />
          ) : keywords.length > 0 ? (
            <ReadTagField label="Keywords" tags={keywords} />
          ) : null}

          {/* Artwork */}
          {item.artwork && (
            <div>
              <Mono>Artwork / Graphics</Mono>
              <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.65, lineHeight: 1.45 }}>{item.artwork}</p>
            </div>
          )}

          {error && <p style={{ margin: 0, color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}>{error}</p>}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', borderTop: '1px solid var(--color-hairline-soft)', paddingTop: 'var(--space-lg)', marginTop: 'var(--space-lg)' }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        {!isSold && (
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Mono({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 4 }}>{children}</div>;
}

interface EditableTagFieldProps {
  label: string;
  tags: string[];
  input: string;
  onInputChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onAdd: () => void;
  onRemove: (tag: string) => void;
  colorDot?: boolean;
}

function EditableTagField({ label, tags, input, onInputChange, onKeyDown, onAdd, onRemove, colorDot }: EditableTagFieldProps) {
  return (
    <div>
      <Mono>{label}</Mono>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {tags.map(tag => (
          <Tag key={tag} tag={tag} colorDot={colorDot} onRemove={() => onRemove(tag)} />
        ))}
        <input value={input} onChange={e => onInputChange(e.target.value)} onKeyDown={onKeyDown} onBlur={onAdd} placeholder={`Add…`} style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-ink)', minWidth: 60, flex: 1 }} />
      </div>
    </div>
  );
}

function ReadTagField({ label, tags, colorDot }: { label: string; tags: string[]; colorDot?: boolean }) {
  return (
    <div>
      <Mono>{label}</Mono>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.map(tag => <Tag key={tag} tag={tag} colorDot={colorDot} />)}
      </div>
    </div>
  );
}

function Tag({ tag, colorDot, onRemove }: { tag: string; colorDot?: boolean; onRemove?: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--color-surface-soft)', borderRadius: 'var(--radius-pill)', padding: '3px 10px 3px 8px', fontSize: 13, fontWeight: 480 }}>
      {colorDot && <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: tag.replace(/\s+/g, ''), border: '1px solid rgba(0,0,0,0.1)' }} />}
      {tag}
      {onRemove && (
        <button onClick={onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.4, fontSize: 13, display: 'flex' }}>×</button>
      )}
    </span>
  );
}
