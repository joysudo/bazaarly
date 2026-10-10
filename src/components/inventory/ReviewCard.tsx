import { useState } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';
import type { GarmentItem, BazaarlyEvent, ApprovePayload } from '../../lib/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { getItemImageUrl } from '../../lib/garmentVision';

interface ReviewCardProps {
  item: GarmentItem;
  events: BazaarlyEvent[];
  onApprove: (payload: ApprovePayload) => Promise<void>;
  onDiscard: () => Promise<void>;
  onRetry: () => Promise<void>;
}

export function ReviewCard({ item, events, onApprove, onDiscard, onRetry }: ReviewCardProps) {
  const desc = item.descriptions;
  const [title, setTitle] = useState(desc?.short_title ?? desc?.overview?.slice(0, 60) ?? '');
  const [price, setPrice] = useState(parsePriceStr(desc?.price));
  const [garmentType, setGarmentType] = useState(desc?.garment_type ?? '');
  const [colors, setColors] = useState<string[]>(desc?.main_colors ?? []);
  const [keywords, setKeywords] = useState<string[]>(desc?.search_text ?? []);
  const [eventId, setEventId] = useState<string | null>(null);
  const [colorInput, setColorInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [busy, setBusy] = useState<'approve' | 'discard' | 'retry' | null>(null);

  const overview = desc?.overview ?? '';
  const artwork = desc?.sections?.prints_graphics_text ?? '';

  async function wrap(key: typeof busy, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); }
    catch (err) { console.error(err); }
    finally { setBusy(null); }
  }

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

  function handleColorKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addColor(); }
  }

  function handleKeywordKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(); }
  }

  function handleApprove() {
    wrap('approve', () => onApprove({
      price: parseFloat(price) || 0,
      title: title.trim() || overview.slice(0, 60) || 'Untitled',
      garmentType: garmentType.trim(),
      mainColors: colors,
      searchText: keywords,
      artwork,
      eventId,
    }));
  }

  const upcomingEvents = events.filter(e => e.status === 'upcoming');

  return (
    <div style={{ background: 'var(--color-canvas)', border: '1.5px solid var(--color-hairline)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
      {/* Image */}
      <div style={{ flexShrink: 0, width: 180, height: 180, borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface-soft)' }}>
        <img
          src={getItemImageUrl(item.item_id)}
          alt="Item"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
        />
      </div>

      {/* Fields */}
      <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {/* Name + overview */}
        <div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Item name…"
            style={{
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-card-title)', fontWeight: 700,
              border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-ink)',
              width: '100%', padding: 0, lineHeight: 1.3,
            }}
          />
          {overview && (
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-body-sm)', opacity: 0.55, lineHeight: 1.45, fontStyle: 'italic' }}>
              {overview.slice(0, 180)}{overview.length > 180 ? '…' : ''}
            </p>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--color-hairline-soft)' }} />

        {/* Price · Type · Event */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 100px' }}>
            <Input
              label="Price ($)"
              id={`price-${item.item_id}`}
              type="number"
              min="0"
              step="0.50"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="12.00"
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <Input
              label="Garment Type"
              id={`type-${item.item_id}`}
              value={garmentType}
              onChange={e => setGarmentType(e.target.value)}
              placeholder="T-shirt, jacket…"
            />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-body-sm)', fontWeight: 480, letterSpacing: '-0.14px', marginBottom: 6 }}>
              Event
            </label>
            <select
              value={eventId ?? ''}
              onChange={e => setEventId(e.target.value || null)}
              style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', background: 'var(--color-canvas)', color: 'var(--color-ink)', border: '1.5px solid var(--color-hairline)', borderRadius: 'var(--radius-md)', padding: '10px 12px', width: '100%', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Unassigned</option>
              {upcomingEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
        </div>

        {/* Colors */}
        <TagField
          label="Colors"
          tags={colors}
          input={colorInput}
          onInputChange={setColorInput}
          onKeyDown={handleColorKey}
          onAdd={addColor}
          onRemove={c => setColors(prev => prev.filter(x => x !== c))}
          colorDot
        />

        {/* Keywords */}
        <TagField
          label="Keywords"
          tags={keywords}
          input={keywordInput}
          onInputChange={setKeywordInput}
          onKeyDown={handleKeywordKey}
          onAdd={addKeyword}
          onRemove={k => setKeywords(prev => prev.filter(x => x !== k))}
        />

        {/* Artwork */}
        {artwork && (
          <div>
            <Mono>Artwork / Graphics</Mono>
            <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.65, lineHeight: 1.45 }}>{artwork}</p>
          </div>
        )}

        <div style={{ height: 1, background: 'var(--color-hairline-soft)' }} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={handleApprove} disabled={busy !== null}>
            {busy === 'approve' ? 'Saving…' : 'Approve & Save'}
          </Button>
          <Button variant="secondary" onClick={() => wrap('retry', onRetry)} disabled={busy !== null}>
            {busy === 'retry' ? 'Retrying…' : 'Retry AI'}
          </Button>
          <Button variant="tertiary" onClick={() => wrap('discard', onDiscard)} disabled={busy !== null} style={{ color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}>
            {busy === 'discard' ? 'Discarding…' : 'Discard'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Mono({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 4 }}>
      {children}
    </div>
  );
}

interface TagFieldProps {
  label: string;
  tags: string[];
  input: string;
  onInputChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onAdd: () => void;
  onRemove: (tag: string) => void;
  colorDot?: boolean;
}

/** Strip "$", commas, spaces so "$15.00" → "15.00" */
function parsePriceStr(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[^0-9.]/g, '');
  return cleaned || '';
}

function TagField({ label, tags, input, onInputChange, onKeyDown, onAdd, onRemove, colorDot }: TagFieldProps) {
  return (
    <div>
      <Mono>{label}</Mono>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {tags.map(tag => (
          <span
            key={tag}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'var(--color-surface-soft)',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 10px 3px 8px',
              fontSize: 13, fontWeight: 480,
            }}
          >
            {colorDot && (
              <span style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: tag.replace(/\s+/g, ''),
                border: '1px solid rgba(0,0,0,0.1)',
              }} />
            )}
            {tag}
            <button
              onClick={() => onRemove(tag)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.4, fontSize: 13, display: 'flex' }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onAdd}
          placeholder={`Add ${label.toLowerCase().slice(0, -1)}…`}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'var(--font-sans)', fontSize: 13,
            color: 'var(--color-ink)', minWidth: 80, flex: 1,
          }}
        />
      </div>
    </div>
  );
}
