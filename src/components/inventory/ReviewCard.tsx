import { useState } from 'react';
import type { GarmentItem } from '../../lib/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { getItemImageUrl } from '../../lib/garmentVision';

interface ReviewCardProps {
  item: GarmentItem;
  onApprove: (price: number, title: string) => Promise<void>;
  onDiscard: () => Promise<void>;
  onRetry: () => Promise<void>;
}

export function ReviewCard({ item, onApprove, onDiscard, onRetry }: ReviewCardProps) {
  const [price, setPrice] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<'approve' | 'discard' | 'retry' | null>(null);

  async function wrap<T>(key: typeof busy, fn: () => Promise<T>) {
    setBusy(key);
    try { await fn(); }
    catch (err) { console.error(err); }
    finally { setBusy(null); }
  }

  const overview = item.descriptions?.overview ?? '';
  const autoTitle = title || overview.slice(0, 60);

  return (
    <div
      style={{
        background: 'var(--color-canvas)',
        border: '1.5px solid var(--color-hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        display: 'flex',
        gap: 'var(--space-lg)',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 160,
          height: 160,
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          background: 'var(--color-surface-soft)',
        }}
      >
        <img
          src={getItemImageUrl(item.item_id)}
          alt="Item"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {overview && (
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45, marginBottom: 4 }}>
              AI Overview
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', opacity: 0.75, lineHeight: 1.5 }}>
              {overview.slice(0, 200)}{overview.length > 200 ? '…' : ''}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <Input
              label="Title"
              id={`title-${item.item_id}`}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={autoTitle.slice(0, 40) || 'e.g. Vintage band tee'}
            />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
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
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={() => wrap('approve', () => onApprove(parseFloat(price) || 0, autoTitle))}
            disabled={busy !== null}
          >
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => wrap('retry', onRetry)}
            disabled={busy !== null}
          >
            {busy === 'retry' ? 'Retrying…' : 'Retry AI'}
          </Button>
          <Button
            variant="tertiary"
            onClick={() => wrap('discard', onDiscard)}
            disabled={busy !== null}
            style={{ color: 'var(--color-accent-magenta)', fontSize: 'var(--text-body-sm)' }}
          >
            {busy === 'discard' ? 'Discarding…' : 'Discard'}
          </Button>
        </div>
      </div>
    </div>
  );
}
