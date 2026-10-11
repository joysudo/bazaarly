import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { ReviewCard } from './ReviewCard';
import { uploadFrame, approveItem, discardItem, retryItem, getItem } from '../../lib/garmentVision';
import type { GarmentItem, BazaarlyEvent, ApprovePayload } from '../../lib/types';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  events: BazaarlyEvent[];
  onItemApproved: (item: GarmentItem, payload: ApprovePayload) => Promise<void>;
}

async function pollUntilReady(itemId: string, maxAttempts = 15): Promise<GarmentItem | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const item = await getItem(itemId);
      if (item.status !== 'processing') return item;
    } catch { /* keep polling */ }
  }
  return null;
}

export function UploadModal({ open, onClose, events, onItemApproved }: UploadModalProps) {
  const [pendingItems, setPendingItems] = useState<GarmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [messages, setMessages] = useState<{ type: 'error' | 'info'; text: string }[]>([]);

  function addMessage(type: 'error' | 'info', text: string) {
    setMessages(prev => [...prev, { type, text }]);
  }

  async function processFiles(files: File[]) {
    setUploading(true);
    setMessages([]);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    for (const file of imageFiles) {
      try {
        const result = await uploadFrame(file);
        switch (result.result) {
          case 'new_item': {
            addMessage('info', `${file.name}: Processing with AI…`);
            const item = await pollUntilReady(result.item_id);
            if (item) {
              setPendingItems(prev => [...prev, item]);
              setMessages(prev => prev.filter(m => !m.text.startsWith(file.name)));
            } else {
              addMessage('error', `${file.name}: Processing timed out — try again`);
            }
            break;
          }
          case 'awaiting_approval': {
            const item = await getItem(result.item_id);
            setPendingItems(prev => [...prev, item]);
            break;
          }
          case 'duplicate_pending': {
            addMessage('info', `${file.name}: Possible duplicate — showing existing item`);
            try {
              const item = await getItem(result.existing_item.item_id);
              setPendingItems(prev => {
                if (prev.some(i => i.item_id === item.item_id)) return prev;
                return [...prev, item];
              });
            } catch { /* existing item may be unavailable */ }
            break;
          }
          case 'suppressed':
            addMessage('info', `${file.name}: Duplicate detected, skipped`);
            break;
          case 'no_garment':
            addMessage('error', `${file.name}: No garment detected in image`);
            break;
          case 'rejected':
            addMessage('error', `${file.name}: Image rejected (${result.reason})`);
            break;
          case 'cooldown':
            addMessage('error', `${file.name}: Service busy — wait a moment and retry`);
            break;
          case 'awaiting_user':
            addMessage('info', `${file.name}: Awaiting user action`);
            break;
        }
      } catch (err) {
        addMessage('error', `${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`);
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

  async function handleApprove(item: GarmentItem, payload: ApprovePayload) {
    await approveItem(item.item_id);
    await onItemApproved(item, payload);
    setPendingItems(prev => prev.filter(i => i.item_id !== item.item_id));
    if (pendingItems.length === 1 && !uploading) handleClose();
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
    setMessages([]);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Upload Images" maxWidth={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {/* Drop zone */}
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
          <label style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 18px 10px', background: 'var(--color-canvas)', color: 'var(--color-ink)', borderRadius: 'var(--radius-pill)', border: '1.5px solid var(--color-hairline)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-lg)', fontWeight: 480, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1 }}>
            {uploading ? 'Processing…' : 'Select Images'}
            <input type="file" accept="image/*" multiple onChange={handleFileInput} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>

        {/* Status messages */}
        {messages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  background: m.type === 'error' ? 'var(--color-block-pink)' : 'var(--color-block-cream)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  fontSize: 'var(--text-body-sm)',
                }}
              >
                {m.text}
              </div>
            ))}
          </div>
        )}

        {/* Review queue */}
        {pendingItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.45 }}>
              Review {pendingItems.length} item{pendingItems.length > 1 ? 's' : ''}
            </div>
            {pendingItems.map(item => (
              <ReviewCard
                key={item.item_id}
                item={item}
                events={events}
                onApprove={payload => handleApprove(item, payload)}
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
