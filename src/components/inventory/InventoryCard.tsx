import { useState } from 'react';
import type { InventoryItem } from '../../lib/types';

interface InventoryCardProps {
  item: InventoryItem;
  eventName?: string;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onClick?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

export function InventoryCard({ item, eventName, selected, onSelect, onClick, onDelete }: InventoryCardProps) {
  const isSold = item.status === 'sold';
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-surface-soft)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'pointer',
        border: `2px solid ${selected ? 'var(--color-primary)' : 'transparent'}`,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; setHovered(true); }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; setHovered(false); }}
    >
      {/* Checkbox */}
      {onSelect && (
        <div
          onClick={onSelect}
          style={{
            position: 'absolute', top: 8, left: 8, zIndex: 1,
            background: selected ? 'var(--color-primary)' : 'rgba(255,255,255,0.85)',
            border: '1.5px solid var(--color-hairline)',
            borderRadius: 4, width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          {selected && <span style={{ color: 'white', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
        </div>
      )}

      {/* Sold ribbon */}
      {isSold && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, background: 'var(--color-block-navy)', color: 'var(--color-inverse-ink)', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
          Sold
        </div>
      )}

      {/* Trash icon — hover reveal */}
      {onDelete && hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(e); }}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 2,
            background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 6,
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'white', fontSize: 14, lineHeight: 1,
            backdropFilter: 'blur(2px)',
          }}
          title="Delete item"
        >
          🗑
        </button>
      )}

      {/* Image */}
      <div style={{ aspectRatio: '1 / 1', overflow: 'hidden', background: 'var(--color-hairline-soft)' }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              filter: isSold ? 'grayscale(0.7) opacity(0.75)' : 'none',
              transition: 'filter 0.2s',
            }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2, fontSize: 40 }}>
            📷
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px var(--space-md) var(--space-md)' }}>
        {/* Price */}
        {item.price > 0 && (
          <div style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)', marginBottom: 0, color: isSold ? 'var(--color-ink)' : 'var(--color-ink)', opacity: isSold ? 0.45 : 1 }}>
            ${item.price.toFixed(2)}
          </div>
        )}

        {/* Name */}
        <p style={{ margin: '0', fontSize: 'var(--text-body-sm)', fontWeight: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: isSold ? 0.5 : 1 }}>
          {item.title || 'Untitled'}
        </p>

        <div style={{ margin: '0', fontSize: 11, display: 'flex'}}>
          {/* Type */}
          {item.garmentType && (
            <span style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.4, marginRight: 'auto' }}>
              {item.garmentType}
            </span>
          )}

          {/* Event */}
          <span style={{ margin: '0 0 0', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: eventName ? 0.55 : 0.3 }}>
            {eventName ?? 'Unassigned'}
          </span>
        </div>
      </div>
    </div>
  );
}
