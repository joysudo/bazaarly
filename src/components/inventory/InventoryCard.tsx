import React from 'react';
import type { InventoryItem } from '../../lib/types';
import { Badge } from '../ui/Badge';

interface InventoryCardProps {
  item: InventoryItem;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onClick?: () => void;
}

export function InventoryCard({ item, selected, onSelect, onClick }: InventoryCardProps) {
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
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {onSelect && (
        <div
          onClick={onSelect}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 1,
            background: selected ? 'var(--color-primary)' : 'rgba(255,255,255,0.85)',
            border: '1.5px solid var(--color-hairline)',
            borderRadius: 4,
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {selected && <span style={{ color: 'white', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
        </div>
      )}

      <div style={{ aspectRatio: '1 / 1', overflow: 'hidden', background: 'var(--color-hairline-soft)' }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.2,
              fontSize: 40,
            }}
          >
            📷
          </div>
        )}
      </div>

      <div style={{ padding: 'var(--space-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-xxs)', gap: 8 }}>
          <Badge variant={item.status} />
          {item.price > 0 && (
            <span style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)', flexShrink: 0 }}>
              ${item.price.toFixed(2)}
            </span>
          )}
        </div>
        <p
          style={{
            margin: '4px 0 2px',
            fontSize: 'var(--text-body-sm)',
            fontWeight: 480,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title || 'Untitled'}
        </p>
        {item.overview && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              opacity: 0.55,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
            }}
          >
            {item.overview}
          </p>
        )}
      </div>
    </div>
  );
}
