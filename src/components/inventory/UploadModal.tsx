import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { ReviewCard } from './ReviewCard';
import { uploadFrame, approveItem, discardItem, retryItem } from '../../lib/garmentVision';
import type { GarmentItem } from '../../lib/types';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onItemApproved: (item: GarmentItem, price: number, title: string) => Promise<void>;
}

export function UploadModal({ open, onClose, onItemApproved }: UploadModalProps) {
  const [pendingItems, setPendingItems] = useState<GarmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function processFiles(files: File[]) {
    setUploading(true);
    setErrors([]);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    for (const file of imageFiles) {
      try {
        const result = await uploadFrame(file);
        if (result?.item_id) {
          setPendingItems(prev => [...prev, result]);
        } else if (result?.pending_id) {
          setErrors(prev => [...prev, `${file.name}: Pending — check back shortly`]);
        }
      } catch (err) {
        setErrors(prev => [...prev, `${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`]);
      }
    }
    setUploading(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) processFiles(files);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) processFiles(files);
  }

  async function handleApprove(item: GarmentItem, price: number, title: string) {
    await approveItem(item.item_id);
    await onItemApproved(item, price, title);
    setPendingItems(prev => prev.filter(i => i.item_id !== item.item_id));
  }

  async function handleDiscard(item: GarmentItem) {
    await discardItem(item.item_id);
    setPendingItems(prev => prev.filter(i => i.item_id !== item.item_id));
  }

  async function handleRetry(item: GarmentItem) {
    const updated = await retryItem(item.item_id);
    if (updated?.item_id) {
      setPendingItems(prev => prev.map(i => i.item_id === item.item_id ? updated : i));
    }
  }

  function handleClose() {
    setPendingItems([]);
    setErrors([]);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Upload Images" maxWidth={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? 'var(--color-ink)' : 'var(--color-hairline)'}`,
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-xxl) var(--space-xl)',
            textAlign: 'center',
            background: dragOver ? 'var(--color-surface-soft)' : 'transparent',
            transition: 'all 0.15s',
          }}
        >
          <p style={{ margin: '0 0 var(--space-md)', fontSize: 'var(--text-body-sm)', opacity: 0.55 }}>
            {uploading ? 'Processing images with AI…' : 'Drop images here, or click to select'}
          </p>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 18px 10px',
              background: 'var(--color-canvas)',
              color: 'var(--color-ink)',
              borderRadius: 'var(--radius-pill)',
              border: '1.5px solid var(--color-hairline)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-body-lg)',
              fontWeight: 480,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.5 : 1,
            }}
          >
            {uploading ? 'Processing…' : 'Select Images'}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>
        </div>

        {errors.length > 0 && (
          <div style={{ background: 'var(--color-block-pink)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
            {errors.map((err, i) => (
              <p key={i} style={{ margin: i > 0 ? '4px 0 0' : 0, fontSize: 'var(--text-body-sm)' }}>{err}</p>
            ))}
          </div>
        )}

        {pendingItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45 }}>
              Review {pendingItems.length} item{pendingItems.length > 1 ? 's' : ''}
            </div>
            {pendingItems.map(item => (
              <ReviewCard
                key={item.item_id}
                item={item}
                onApprove={(price, title) => handleApprove(item, price, title)}
                onDiscard={() => handleDiscard(item)}
                onRetry={() => handleRetry(item)}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
